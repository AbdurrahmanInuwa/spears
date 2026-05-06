// SMS via Twilio. Falls back to a console stub if creds are missing so dev
// still works without keys. Returns { ok, messageId? } or { ok: false, reason }.
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
        '[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — SMS will be stubbed.'
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
  const trimmed = String(phone).trim();
  if (!trimmed.startsWith('+')) return trimmed;
  return trimmed;
}

async function send({ to, message }) {
  const c = getClient();
  if (!c) return { ok: false, reason: 'no_credentials' };
  const dest = toE164(to);
  if (!dest) return { ok: false, reason: 'no_recipient' };

  // Either set TWILIO_FROM (e.g. +1XXXX a Twilio number) OR
  // TWILIO_MESSAGING_SERVICE_SID (recommended in prod — handles routing,
  // sender pooling, and per-country compliance automatically).
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM;
  if (!messagingServiceSid && !from) {
    return { ok: false, reason: 'no_sender_configured' };
  }

  try {
    const opts = { to: dest, body: message };
    if (messagingServiceSid) opts.messagingServiceSid = messagingServiceSid;
    else opts.from = from;
    const msg = await c.messages.create(opts);
    return { ok: true, messageId: msg.sid, status: msg.status };
  } catch (err) {
    console.error('[sms] twilio send failed:', err.message || err);
    return {
      ok: false,
      reason: err.code ? `twilio_${err.code}` : err.message || 'send_failed',
    };
  }
}

module.exports = { send };
