// Notification dispatcher. Email goes through Gmail SMTP (lib/mailer.js)
// when USER + APP_PASSWORD are configured; voice + SMS are still stubbed
// to console (Phase C: Twilio).
const prisma = require('./prisma');
const { sendMail } = require('./mailer');
const sms = require('./sms');
const voice = require('./voice');

const PUBLIC_APP_URL =
  process.env.PUBLIC_APP_URL || 'http://localhost:3000';

function institutionLink(token) {
  return `${PUBLIC_APP_URL}/e/${token}`;
}
function dispatcherLink(token) {
  return `${PUBLIC_APP_URL}/d/${token}`;
}
function volunteerLink(token) {
  return `${PUBLIC_APP_URL}/v/${token}`;
}

function emailHtml({ heading, intro, link, ctaLabel, footer }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="background:#dc2626;padding:18px 24px;color:#fff;font-weight:800;letter-spacing:0.1em;font-size:14px;text-transform:uppercase;">SPAERS</td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 8px 0;font-size:20px;color:#0f172a;">${heading}</h1>
          <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#475569;">${intro}</p>
          <p style="margin:0;">
            <a href="${link}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:15px;">${ctaLabel}</a>
          </p>
          <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;word-break:break-all;">If the button doesn't work, open: <a href="${link}" style="color:#dc2626;">${link}</a></p>
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #f1f5f9;background:#f8fafc;font-size:11px;color:#94a3b8;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendVoice({ to, message, emergencyType, emergencyId, audience, audienceId }) {
  const result = await voice.call({ to, message, emergencyType });
  if (result.ok) {
    console.log(`[VOICE → ${to}] placed (id=${result.callId || ''})`);
  } else {
    console.warn(`[VOICE → ${to}] not placed (${result.reason})`);
  }
  await prisma.emergencyNotification.create({
    data: {
      emergencyId,
      audience,
      audienceId,
      channel: 'voice',
      recipient: to,
      status: result.ok ? 'sent' : 'failed',
      payload: {
        message,
        callId: result.callId || null,
        error: result.ok ? null : result.reason,
      },
    },
  });
}

async function sendSMS({ to, message, emergencyId, audience, audienceId }) {
  const result = await sms.send({ to, message });
  if (result.ok) {
    console.log(`[SMS → ${to}] sent (id=${result.messageId || ''})`);
  } else {
    console.warn(`[SMS → ${to}] not sent (${result.reason})`);
  }
  await prisma.emergencyNotification.create({
    data: {
      emergencyId,
      audience,
      audienceId,
      channel: 'sms',
      recipient: to,
      status: result.ok ? 'sent' : 'failed',
      payload: {
        message,
        messageId: result.messageId || null,
        error: result.ok ? null : result.reason,
      },
    },
  });
}

async function sendEmail({
  to,
  subject,
  intro,
  link,
  ctaLabel = 'Open SPAERS',
  footer = 'You are receiving this because your account is registered as a responder.',
  emergencyId,
  audience,
  audienceId,
}) {
  const text = `${intro}\n\nOpen: ${link}`;
  const html = emailHtml({
    heading: subject,
    intro,
    link,
    ctaLabel,
    footer,
  });
  const result = await sendMail({ to, subject, text, html });
  if (result.ok) {
    console.log(`[EMAIL → ${to}] sent (id=${result.messageId})`);
  } else {
    console.warn(`[EMAIL → ${to}] not sent (${result.reason})`);
  }
  await prisma.emergencyNotification.create({
    data: {
      emergencyId,
      audience,
      audienceId,
      channel: 'email',
      recipient: to,
      status: result.ok ? 'sent' : 'failed',
      payload: { subject, intro, link, error: result.reason || null },
    },
  });
}

async function notifyInstitution({ emergency, institution, token }) {
  const link = institutionLink(token);
  const subject = `Emergency · ${emergency.type}`;
  const intro = `An SOS has been triggered in your coverage area. Tap below to view the location and dispatch a responder.`;
  const tasks = [];
  for (const phone of institution.responseNumbers || []) {
    tasks.push(
      sendVoice({
        to: phone,
        emergencyType: emergency.type,
        emergencyId: emergency.id,
        audience: 'institution',
        audienceId: institution.id,
      })
    );
    tasks.push(
      sendSMS({
        to: phone,
        message: `${subject}. Open: ${link}`,
        emergencyId: emergency.id,
        audience: 'institution',
        audienceId: institution.id,
      })
    );
  }
  for (const email of institution.responseEmails || []) {
    tasks.push(
      sendEmail({
        to: email,
        subject,
        intro,
        link,
        ctaLabel: 'View emergency',
        footer: `You are receiving this as a registered responder for ${institution.name || 'your institution'}.`,
        emergencyId: emergency.id,
        audience: 'institution',
        audienceId: institution.id,
      })
    );
  }
  await Promise.all(tasks);
}

async function notifyDispatcher({ emergency, dispatcher, token }) {
  const link = dispatcherLink(token);
  const subject = `Dispatch · ${emergency.type}`;
  const intro = `You have been dispatched to an emergency. Tap below to start navigation.`;
  const tasks = [];
  for (const phone of dispatcher.phones || []) {
    tasks.push(
      sendVoice({
        to: phone,
        emergencyType: emergency.type,
        emergencyId: emergency.id,
        audience: 'dispatcher',
        audienceId: dispatcher.id,
      })
    );
    tasks.push(
      sendSMS({
        to: phone,
        message: `${subject}. Open: ${link}`,
        emergencyId: emergency.id,
        audience: 'dispatcher',
        audienceId: dispatcher.id,
      })
    );
  }
  for (const email of dispatcher.emails || []) {
    tasks.push(
      sendEmail({
        to: email,
        subject,
        intro,
        link,
        ctaLabel: 'Start navigation',
        footer: `You are receiving this as a registered dispatcher (${dispatcher.dispatcherId || ''}).`,
        emergencyId: emergency.id,
        audience: 'dispatcher',
        audienceId: dispatcher.id,
      })
    );
  }
  await Promise.all(tasks);
}

// Notify the adult family members of a citizen who triggered an emergency.
// Excludes the triggerer and any under-18 members.
async function notifyFamilyMembers({ emergency, triggerer, members }) {
  function ageFromDob(dob) {
    if (!dob) return null;
    const d = dob instanceof Date ? dob : new Date(dob);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  }
  const recipients = (members || []).filter((m) => {
    if (!m || m.id === triggerer.id) return false;
    const a = ageFromDob(m.dob);
    if (a == null) return true;
    return a >= 18;
  });
  if (recipients.length === 0) return;

  const triggererName =
    `${triggerer.firstName || ''} ${triggerer.lastName || ''}`.trim() ||
    'A family member';
  const mapsLink = `https://www.google.com/maps?q=${emergency.victimLat},${emergency.victimLng}`;
  const subject = `Family alert · ${triggererName} has an emergency`;
  const intro = `${triggererName}, a member of your family, just triggered a SPAERS ${emergency.type} emergency. Tap below to see their location.`;

  const tasks = [];
  for (const m of recipients) {
    if (m.phone) {
      tasks.push(
        sendSMS({
          to: m.phone,
          message: `${triggererName}, a member of your family, has a ${emergency.type} emergency. Location: ${mapsLink}`,
          emergencyId: emergency.id,
          audience: 'family',
          audienceId: m.id,
        })
      );
      // Only the family creator's chosen call-list (max 2) get a phone
      // call on top of SMS + email.
      if (m.familyCallEligible) {
        tasks.push(
          sendVoice({
            to: m.phone,
            message: `Hello. A member of your family, ${triggererName}, has a ${
              /^[aeiouAEIOU]/.test(emergency.type) ? 'an' : 'a'
            } ${emergency.type} emergency.`,
            emergencyId: emergency.id,
            audience: 'family',
            audienceId: m.id,
          })
        );
      }
    }
    if (m.email) {
      tasks.push(
        sendEmail({
          to: m.email,
          subject,
          intro,
          link: mapsLink,
          ctaLabel: 'See location',
          footer: `You are receiving this because you are a family member of ${triggererName} on SPAERS.`,
          emergencyId: emergency.id,
          audience: 'family',
          audienceId: m.id,
        })
      );
    }
  }
  await Promise.all(tasks);
}

// Send SMS + voice to a single volunteer with a token-protected link.
// The caller (POST /api/emergencies) does the field-match filtering and
// token issuing; this function is purely the messaging layer.
async function notifyVolunteer({ emergency, volunteer, citizen, token }) {
  const link = volunteerLink(token);
  const article = /^[aeiouAEIOU]/.test(emergency.type) ? 'an' : 'a';
  const tasks = [];
  if (citizen.phone) {
    tasks.push(
      sendSMS({
        to: citizen.phone,
        message: `SPAERS volunteer alert: ${article} ${emergency.type} emergency near you. Open: ${link}`,
        emergencyId: emergency.id,
        audience: 'volunteer',
        audienceId: volunteer.id,
      })
    );
    tasks.push(
      sendVoice({
        to: citizen.phone,
        message: `Hello. There is ${article} ${emergency.type} emergency near you. You are receiving this as a SPAERS volunteer.`,
        emergencyId: emergency.id,
        audience: 'volunteer',
        audienceId: volunteer.id,
      })
    );
  }
  await Promise.all(tasks);
}

// Helper exposed to routes — picks volunteers whose field matches the
// emergency type. Returns the matching volunteer rows with citizen info.
function pickMatchingVolunteers(volunteers, emergencyType) {
  const type = String(emergencyType || '').toLowerCase();
  function ageFromDob(dob) {
    if (!dob) return null;
    const d = dob instanceof Date ? dob : new Date(dob);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  }
  function fieldMatches(field) {
    const f = String(field || '').toLowerCase();
    if (f.includes('general')) return true;
    if (type === 'medical' && f.includes('medical')) return true;
    if ((type === 'fire' || type === 'flooding') && f.includes('fire')) return true;
    if ((type === 'shooting' || type === 'assault') && f.includes('public safety'))
      return true;
    if (f.includes('search') && (type === 'flooding' || type === 'medical')) return true;
    return false;
  }
  return (volunteers || []).filter((v) => {
    if (!v.citizen?.phone) return false;
    const age = ageFromDob(v.citizen.dob);
    if (age != null && age < 18) return false;
    return fieldMatches(v.field);
  });
}

// Send a 6-digit OTP via email. Subject/intro vary by purpose.
async function sendOtpEmail({ to, code, purpose }) {
  const labels = {
    signup: {
      subject: 'Verify your SPAERS account',
      heading: 'Confirm your email',
      intro:
        'Welcome to SPAERS. Use the code below to verify your email address and finish creating your account.',
    },
    change_password: {
      subject: 'Confirm your password change',
      heading: 'Confirm password change',
      intro:
        "Use the code below to confirm you're changing your SPAERS password.",
    },
    reset_password: {
      subject: 'Reset your SPAERS password',
      heading: 'Reset your password',
      intro:
        'Use the code below to reset your SPAERS password. If you didn\u2019t request this, you can safely ignore this email.',
    },
    login_2fa: {
      subject: 'Your SPAERS sign-in code',
      heading: 'Two-factor sign-in',
      intro:
        'Use the code below to finish signing in to SPAERS. If you weren\u2019t trying to sign in, change your password immediately.',
    },
  };
  const meta = labels[purpose] || labels.signup;
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="background:#dc2626;padding:18px 24px;color:#fff;font-weight:800;letter-spacing:0.1em;font-size:14px;text-transform:uppercase;">SPAERS</td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 8px 0;font-size:20px;color:#0f172a;">${meta.heading}</h1>
          <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#475569;">${meta.intro}</p>
          <div style="text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin:0 0 16px 0;">
            <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:32px;letter-spacing:0.4em;color:#0f172a;font-weight:700;">${code}</p>
          </div>
          <p style="margin:0;font-size:12px;color:#94a3b8;">This code expires in 10 minutes. Never share it with anyone.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = `${meta.intro}\n\nYour code: ${code}\n\nIt expires in 10 minutes.`;
  const result = await sendMail({ to, subject: meta.subject, text, html });
  if (result.ok) console.log(`[OTP → ${to}] sent (id=${result.messageId})`);
  else console.warn(`[OTP → ${to}] not sent (${result.reason})`);
  return result;
}

module.exports = {
  notifyInstitution,
  notifyDispatcher,
  notifyFamilyMembers,
  notifyVolunteer,
  pickMatchingVolunteers,
  institutionLink,
  dispatcherLink,
  volunteerLink,
  sendOtpEmail,
};
