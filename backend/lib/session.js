// httpOnly cookie sessions backed by Redis. Single source of truth for
// "who is calling this endpoint" for citizen + institution dashboards.
const crypto = require('crypto');
const redis = require('./redis');

const COOKIE_NAME = 'spaers_sid';
const TTL_S = 30 * 24 * 60 * 60; // 30 days
const PREFIX = 'session:';

function cookieOpts() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // Cross-site cookies (Vercel frontend → EC2 backend) require both:
    // SameSite=None and Secure. In dev (same-origin localhost) we keep
    // Lax so the cookie still works without HTTPS.
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: TTL_S * 1000,
  };
}

async function create(res, role, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const payload = JSON.stringify({ role, userId, createdAt: Date.now() });
  await redis.set(PREFIX + token, payload, 'EX', TTL_S);
  res.cookie(COOKIE_NAME, token, cookieOpts());
  return token;
}

async function destroy(req, res) {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await redis.del(PREFIX + token).catch(() => {});
  res.clearCookie(COOKIE_NAME, { ...cookieOpts(), maxAge: undefined });
}

// Reads + validates the session, sliding TTL on every successful access.
async function read(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  const raw = await redis.get(PREFIX + token);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // sliding window
  await redis.expire(PREFIX + token, TTL_S).catch(() => {});
  return { token, ...parsed };
}

// Express middleware. requiredRole optional ('citizen' | 'institution').
// On success: req.session = { role, userId }
function requireAuth(requiredRole) {
  return async (req, res, next) => {
    try {
      const s = await read(req);
      if (!s) return res.status(401).json({ error: 'Unauthorized' });
      if (requiredRole && s.role !== requiredRole) {
        return res.status(403).json({ error: 'Wrong role for this action' });
      }
      req.session = s;
      next();
    } catch (err) {
      console.error('requireAuth error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { COOKIE_NAME, create, destroy, read, requireAuth };
