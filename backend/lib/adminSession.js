// Redis-backed admin session tokens. Single hardcoded ADMIN_SECRET grants
// you a session token; tokens auto-expire and can be revoked instantly.
const crypto = require('crypto');
const redis = require('./redis');

const TTL_S = 12 * 60 * 60; // 12h
const PREFIX = 'admin_session:';

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function createSession() {
  const token = crypto.randomBytes(32).toString('base64url');
  await redis.set(PREFIX + token, '1', 'EX', TTL_S);
  return { token, ttlS: TTL_S };
}

async function isValid(token) {
  if (!token) return false;
  const v = await redis.get(PREFIX + token);
  return v === '1';
}

async function destroySession(token) {
  if (!token) return;
  await redis.del(PREFIX + token);
}

// Express middleware: requires Authorization: Bearer <token>
async function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token || !(await isValid(token))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.adminToken = token;
    next();
  } catch (err) {
    console.error('requireAdmin error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  timingSafeEqual,
  createSession,
  isValid,
  destroySession,
  requireAdmin,
};
