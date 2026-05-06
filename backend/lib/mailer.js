const nodemailer = require('nodemailer');

let transporter = null;
let warned = false;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.USER || process.env.GMAIL_USER;
  const pass = process.env.APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    if (!warned) {
      console.warn('[mailer] USER / APP_PASSWORD not set — emails will be stubbed.');
      warned = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

// Send a single email. Returns { ok: true } on success, { ok: false, reason }
// on failure or missing creds.
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) return { ok: false, reason: 'no_credentials' };
  try {
    const from = process.env.USER || process.env.GMAIL_USER;
    const info = await t.sendMail({
      from: `SPAERS <${from}>`,
      to,
      subject,
      text,
      html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[mailer] send failed:', err.message || err);
    return { ok: false, reason: err.message || 'send_failed' };
  }
}

module.exports = { sendMail };
