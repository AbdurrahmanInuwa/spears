const crypto = require('crypto');

// SPAERS ID = 10 numeric digits (e.g. "4729168305"). 10^10 = 10 B values, so
// collisions are vanishingly rare for any realistic user base.
function randomDigits(length) {
  const bytes = crypto.randomBytes(length);
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String(bytes[i] % 10);
  }
  return s;
}

function generateSpaersId() {
  return randomDigits(10);
}

// Generates a SPAERS ID and verifies it isn't already taken in the citizens
// table. Retries up to maxAttempts on collision.
async function generateUniqueSpaersId(prisma, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateSpaersId();
    const existing = await prisma.citizen.findUnique({
      where: { spaersId: candidate },
    });
    if (!existing) return candidate;
  }
  throw new Error('Could not generate a unique SPAERS ID');
}

// Dispatcher ID — short numeric (4 digits), prefixed: e.g. "DSP-7203"
function generateDispatcherId() {
  return `DSP-${randomDigits(4)}`;
}

async function generateUniqueDispatcherId(prisma, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = generateDispatcherId();
    const existing = await prisma.dispatcher.findUnique({
      where: { dispatcherId: candidate },
    });
    if (!existing) return candidate;
  }
  throw new Error('Could not generate a unique Dispatcher ID');
}

module.exports = {
  generateSpaersId,
  generateUniqueSpaersId,
  generateDispatcherId,
  generateUniqueDispatcherId,
};
