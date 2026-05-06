const crypto = require('crypto');

const TOKEN_BYTES = 32;        // 32 bytes → 256 bits of entropy
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min

function generatePlainToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function hashToken(plain) {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

async function issueToken(prisma, { emergencyId, audience, audienceId, ttlMs }) {
  const plain = generatePlainToken();
  const tokenHash = hashToken(plain);
  const expiresAt = new Date(Date.now() + (ttlMs ?? DEFAULT_TTL_MS));
  await prisma.emergencyToken.create({
    data: { emergencyId, audience, audienceId, tokenHash, expiresAt },
  });
  return plain;
}

// Look up + validate (checks expiry + consumption). Returns the token row
// (with emergency joined) or null.
async function resolveToken(prisma, plain) {
  if (!plain) return null;
  const row = await prisma.emergencyToken.findUnique({
    where: { tokenHash: hashToken(plain) },
    include: { emergency: true },
  });
  if (!row) return null;
  if (row.consumedAt) return { ...row, _invalidReason: 'consumed' };
  if (row.expiresAt < new Date()) return { ...row, _invalidReason: 'expired' };
  return row;
}

async function consumeToken(prisma, id) {
  return prisma.emergencyToken.update({
    where: { id },
    data: { consumedAt: new Date() },
  });
}

module.exports = {
  generatePlainToken,
  hashToken,
  issueToken,
  resolveToken,
  consumeToken,
  DEFAULT_TTL_MS,
};
