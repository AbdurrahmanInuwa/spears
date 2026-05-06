// Redis-backed OTPs. One code per (purpose, role, email).
// - Codes are 6 digits
// - 10-minute expiry
// - 5 attempts before lockout
// - 60-second resend cooldown
const crypto = require('crypto');
const redis = require('./redis');

const TTL_S = 10 * 60;
const COOLDOWN_S = 60;
const MAX_ATTEMPTS = 5;

function code() {
  // 0–999_999, zero-padded to 6 digits
  return String(Math.floor(crypto.randomInt(0, 1_000_000))).padStart(6, '0');
}
function hash(c) {
  return crypto.createHash('sha256').update(String(c)).digest('hex');
}

function key(purpose, role, email) {
  return `otp:${purpose}:${role}:${String(email).trim().toLowerCase()}`;
}
function cooldownKey(purpose, role, email) {
  return `otp_cd:${purpose}:${role}:${String(email).trim().toLowerCase()}`;
}

// Issue a fresh OTP. Returns { code } on success or { error: 'cooldown', retryInS }.
async function issue(purpose, role, email) {
  const cdK = cooldownKey(purpose, role, email);
  const ttl = await redis.ttl(cdK);
  if (ttl > 0) {
    return { error: 'cooldown', retryInS: ttl };
  }
  const c = code();
  const k = key(purpose, role, email);
  // Store hashed code + attempts counter (as a hash)
  await redis.del(k);
  await redis.hset(k, { hash: hash(c), attempts: '0' });
  await redis.expire(k, TTL_S);
  await redis.set(cdK, '1', 'EX', COOLDOWN_S);
  return { code: c, ttlS: TTL_S };
}

// Verify a code. Returns { ok: true } or { error: 'invalid' | 'expired' | 'locked' }.
async function verify(purpose, role, email, supplied) {
  const k = key(purpose, role, email);
  const data = await redis.hgetall(k);
  if (!data || !data.hash) return { error: 'expired' };
  const attempts = Number(data.attempts || 0);
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(k);
    return { error: 'locked' };
  }
  const okHash = hash(String(supplied || '').trim());
  if (okHash !== data.hash) {
    await redis.hincrby(k, 'attempts', 1);
    return { error: 'invalid', attemptsLeft: MAX_ATTEMPTS - (attempts + 1) };
  }
  // Burn the OTP on success
  await redis.del(k);
  return { ok: true };
}

// Mark a verification valid for a short window so the *next* call (e.g.
// /change-password/confirm) can trust it without re-prompting.
async function consumeAndIssueProof(purpose, role, email, ttlS = 5 * 60) {
  const proof = crypto.randomBytes(24).toString('base64url');
  const k = `otp_proof:${purpose}:${role}:${String(email).trim().toLowerCase()}`;
  await redis.set(k, hash(proof), 'EX', ttlS);
  return proof;
}

async function checkProof(purpose, role, email, proof) {
  if (!proof) return false;
  const k = `otp_proof:${purpose}:${role}:${String(email).trim().toLowerCase()}`;
  const stored = await redis.get(k);
  if (!stored) return false;
  if (stored !== hash(proof)) return false;
  await redis.del(k);
  return true;
}

module.exports = {
  issue,
  verify,
  consumeAndIssueProof,
  checkProof,
  TTL_S,
  COOLDOWN_S,
  MAX_ATTEMPTS,
};
