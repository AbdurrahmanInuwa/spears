// Hold the signup payload in Redis until the user verifies their email.
// Once they enter the OTP, we materialize the row in Postgres and delete
// the Redis key. Abandoned signups expire after 30 minutes.
const redis = require('./redis');

const TTL_S = 30 * 60;

function key(role, email) {
  return `pending_signup:${role}:${String(email).trim().toLowerCase()}`;
}

async function stash(role, email, payload) {
  await redis.set(
    key(role, email),
    JSON.stringify(payload),
    'EX',
    TTL_S
  );
}

async function get(role, email) {
  const raw = await redis.get(key(role, email));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function clear(role, email) {
  await redis.del(key(role, email));
}

module.exports = { stash, get, clear, TTL_S };
