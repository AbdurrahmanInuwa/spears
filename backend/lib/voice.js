// Outbound voice calls via Twilio. Uses inline TwiML (twiml=...) so we
// don't need to host a callback URL — Twilio reads the spoken script
// straight from the request body, says it once, then hangs up.
const twilio = require('twilio');

let client = null;
let warned = false;

function getClient() {
  if (client) return client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    if (!warned) {
      console.warn(
        '[voice] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — calls will be stubbed.'
      );
      warned = true;
    }
    return null;
  }
  client = twilio(sid, token);
  return client;
}

function toE164(phone) {
  if (!phone) return null;
  return String(phone).trim();
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Pick the correct article based on the emergency type's first phoneme.
// Defaults to "a"; words starting with a vowel sound get "an".
function articleFor(word) {
  if (!word) return 'a';
  return /^[aeiouAEIOU]/.test(word.trim()) ? 'an' : 'a';
}

// Build the spoken script. Says the alert twice with a short pause for
// clarity, then hangs up. ~6-8 seconds total per call.
function buildTwiml(message) {
  const safe = escapeXml(message);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew" language="en-US">${safe}</Say>
  <Pause length="1"/>
  <Say voice="Polly.Matthew" language="en-US">${safe}</Say>
  <Hangup/>
</Response>`;
}

function buildAlertMessage(emergencyType) {
  if (!emergencyType) return 'Hello. You have an emergency.';
  const article = articleFor(emergencyType);
  return `Hello. You have ${article} ${emergencyType} emergency.`;
}

// Either pass a fully-formed `message` OR an `emergencyType` and we'll
// build the Hello script for you.
async function call({ to, message, emergencyType }) {
  const c = getClient();
  if (!c) return { ok: false, reason: 'no_credentials' };
  const dest = toE164(to);
  if (!dest) return { ok: false, reason: 'no_recipient' };

  const from = process.env.TWILIO_VOICE_FROM || process.env.TWILIO_FROM;
  if (!from) return { ok: false, reason: 'no_voice_from_configured' };

  const spoken = message || buildAlertMessage(emergencyType);

  try {
    const result = await c.calls.create({
      to: dest,
      from,
      twiml: buildTwiml(spoken),
    });
    return { ok: true, callId: result.sid, status: result.status };
  } catch (err) {
    console.error('[voice] twilio call failed:', err.message || err);
    return {
      ok: false,
      reason: err.code ? `twilio_${err.code}` : err.message || 'call_failed',
    };
  }
}

module.exports = { call };
