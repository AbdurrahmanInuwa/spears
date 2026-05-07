const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const otp = require('../lib/otp');
const session = require('../lib/session');
const pendingSignup = require('../lib/pendingSignup');
const { generateUniqueSpaersId } = require('../lib/spaersId');
const { sendOtpEmail } = require('../lib/notify');

const router = express.Router();

// ─── helpers ────────────────────────────────────────────────────────────

let dummyHashPromise = null;
function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('dummy_payload_for_timing_guard', 10);
  }
  return dummyHashPromise;
}

function modelFor(role) {
  if (role === 'citizen') return prisma.citizen;
  if (role === 'institution') return prisma.institution;
  return null;
}

function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

// ─── login ──────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { role, email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const M = modelFor(role);
    if (!M) return res.status(400).json({ error: 'Invalid role' });

    const normalizedEmail = normalize(email);
    const user = await M.findUnique({ where: { email: normalizedEmail } });
    const hash = user?.passwordHash || (await getDummyHash());
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) {
      return res.status(401).json({
        error:
          'Invalid email or password. Make sure the right tab is selected.',
      });
    }
    if (!user.emailVerifiedAt) {
      // Issue a fresh OTP so the user can verify on the spot
      try {
        const issued = await otp.issue('signup', role, normalizedEmail);
        if (issued.code) {
          sendOtpEmail({
            to: normalizedEmail,
            code: issued.code,
            purpose: 'signup',
          }).catch((e) => console.error('OTP email error:', e));
        }
      } catch {}
      return res.status(403).json({
        error: 'Email not verified. Check your inbox for the code.',
        pendingVerification: true,
      });
    }

    // 2FA gate: if enabled, do NOT set the session yet — issue an OTP and
    // ask the frontend to follow up with /verify-login-otp.
    if (user.twoFactorEnabled) {
      try {
        const issued = await otp.issue('login_2fa', role, normalizedEmail);
        if (issued.code) {
          sendOtpEmail({
            to: normalizedEmail,
            code: issued.code,
            purpose: 'login_2fa',
          }).catch((e) => console.error('OTP email error:', e));
        }
      } catch (e) {
        console.error('2FA OTP issue error:', e);
        return res.status(500).json({ error: 'Could not send 2FA code' });
      }
      return res.status(202).json({ role, pending2FA: true });
    }

    await session.create(res, role, user.id);
    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ role, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify-login-otp — second factor of a 2FA login. On
// success, issues the session cookie.
router.post('/verify-login-otp', async (req, res) => {
  try {
    const { role, email, code } = req.body || {};
    if (!modelFor(role) || !email || !code) {
      return res.status(400).json({ error: 'role, email, and code required' });
    }
    const normalizedEmail = normalize(email);
    const v = await otp.verify('login_2fa', role, normalizedEmail, code);
    if (!v.ok) {
      return res.status(400).json({
        error:
          v.error === 'invalid'
            ? `Invalid code${
                typeof v.attemptsLeft === 'number'
                  ? ` (${v.attemptsLeft} ${
                      v.attemptsLeft === 1 ? 'try' : 'tries'
                    } left)`
                  : ''
              }`
            : v.error === 'expired'
              ? 'Code expired. Sign in again.'
              : 'Too many attempts. Sign in again.',
      });
    }
    const M = modelFor(role);
    const user = await M.findUnique({ where: { email: normalizedEmail } });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    await session.create(res, role, user.id);
    const { passwordHash: _ph, ...safeUser } = user;
    res.json({ role, user: safeUser });
  } catch (err) {
    console.error('Verify login OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me — returns the currently logged-in user (citizen or
// institution) based on the session cookie. 401 if no/invalid session.
router.get('/me', async (req, res) => {
  try {
    const s = await session.read(req);
    if (!s) return res.status(401).json({ error: 'Unauthorized' });
    const M = s.role === 'citizen' ? prisma.citizen : prisma.institution;
    const user = await M.findUnique({ where: { id: s.userId } });
    if (!user) {
      await session.destroy(req, res);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { passwordHash: _ph, ...safe } = user;
    res.json({ role: s.role, user: safe });
  } catch (err) {
    console.error('Auth me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  await session.destroy(req, res);
  res.json({ ok: true });
});

// ─── signup OTP: verify + resend ────────────────────────────────────────

router.post('/verify-otp', async (req, res) => {
  try {
    const { role, email, code } = req.body || {};
    const M = modelFor(role);
    if (!M || !email || !code) {
      return res.status(400).json({ error: 'role, email, and code required' });
    }
    const normalizedEmail = normalize(email);
    const result = await otp.verify('signup', role, normalizedEmail, code);
    if (!result.ok) {
      return res.status(400).json({
        error:
          result.error === 'invalid'
            ? `Invalid code${
                typeof result.attemptsLeft === 'number'
                  ? ` (${result.attemptsLeft} ${
                      result.attemptsLeft === 1 ? 'try' : 'tries'
                    } left)`
                  : ''
              }`
            : result.error === 'expired'
              ? 'Code expired. Request a new one.'
              : 'Too many attempts. Request a new code.',
      });
    }

    // Materialize the row from the Redis-stashed payload (or, if a row
    // already exists from a legacy signup, just flip emailVerifiedAt).
    const existing = await M.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      await M.update({
        where: { email: normalizedEmail },
        data: { emailVerifiedAt: new Date() },
      });
    } else {
      const stash = await pendingSignup.get(role, normalizedEmail);
      if (!stash) {
        return res.status(400).json({
          error:
            'Signup session expired. Start over to receive a new code.',
        });
      }
      try {
        if (role === 'citizen') {
          const spaersId = await generateUniqueSpaersId(prisma);
          await prisma.citizen.create({
            data: {
              spaersId,
              firstName: stash.firstName,
              lastName: stash.lastName,
              dob: new Date(stash.dob),
              email: normalizedEmail,
              phone: stash.phone,
              country: stash.country,
              bloodGroup: stash.bloodGroup,
              allergies: stash.allergies,
              chronicCondition: stash.chronicCondition,
              implantDevice: !!stash.implantDevice,
              passwordHash: stash.passwordHash,
              emailVerifiedAt: new Date(),
            },
          });
        } else {
          await prisma.institution.create({
            data: {
              name: stash.name,
              type: stash.type,
              yearEstablished: stash.yearEstablished,
              country: stash.country,
              address: stash.address,
              addressLat: stash.addressLat,
              addressLng: stash.addressLng,
              addressPlaceId: stash.addressPlaceId,
              centerLat: stash.centerLat,
              centerLng: stash.centerLng,
              coveragePolygon: stash.coveragePolygon,
              coverageReason: stash.coverageReason,
              responseNumbers: stash.responseNumbers,
              responseEmails: stash.responseEmails,
              email: stash.email,
              passwordHash: stash.passwordHash,
              emailVerifiedAt: new Date(),
            },
          });
        }
      } catch (createErr) {
        console.error('Materialize signup error:', createErr);
        return res
          .status(500)
          .json({ error: 'Could not finalize signup. Try again.' });
      }
      await pendingSignup.clear(role, normalizedEmail);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { role, email, purpose = 'signup' } = req.body || {};
    if (!modelFor(role) || !email) {
      return res.status(400).json({ error: 'role and email required' });
    }
    const normalizedEmail = normalize(email);
    const issued = await otp.issue(purpose, role, normalizedEmail);
    if (issued.error === 'cooldown') {
      return res.status(429).json({
        error: `Please wait ${issued.retryInS}s before requesting another code.`,
        retryInS: issued.retryInS,
      });
    }
    if (issued.code) {
      sendOtpEmail({
        to: normalizedEmail,
        code: issued.code,
        purpose,
      }).catch((e) => console.error('OTP email error:', e));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── change password (requires current password + OTP) ─────────────────

router.post('/change-password/start', async (req, res) => {
  try {
    const { role, email, currentPassword } = req.body || {};
    const M = modelFor(role);
    if (!M || !email || !currentPassword) {
      return res
        .status(400)
        .json({ error: 'role, email, and currentPassword required' });
    }
    const normalizedEmail = normalize(email);
    const user = await M.findUnique({ where: { email: normalizedEmail } });
    const hash = user?.passwordHash || (await getDummyHash());
    const ok = await bcrypt.compare(currentPassword, hash);
    if (!user || !ok) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const issued = await otp.issue('change_password', role, normalizedEmail);
    if (issued.error === 'cooldown') {
      return res.status(429).json({
        error: `Please wait ${issued.retryInS}s before requesting another code.`,
        retryInS: issued.retryInS,
      });
    }
    if (issued.code) {
      sendOtpEmail({
        to: normalizedEmail,
        code: issued.code,
        purpose: 'change_password',
      }).catch((e) => console.error('OTP email error:', e));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/change-password/confirm', async (req, res) => {
  try {
    const { role, email, code, newPassword } = req.body || {};
    const M = modelFor(role);
    if (!M || !email || !code || !newPassword) {
      return res
        .status(400)
        .json({ error: 'role, email, code, and newPassword required' });
    }
    if (String(newPassword).length < 6) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 6 characters' });
    }
    const normalizedEmail = normalize(email);
    const v = await otp.verify(
      'change_password',
      role,
      normalizedEmail,
      code
    );
    if (!v.ok) {
      return res.status(400).json({
        error:
          v.error === 'invalid'
            ? `Invalid code${
                typeof v.attemptsLeft === 'number'
                  ? ` (${v.attemptsLeft} left)`
                  : ''
              }`
            : v.error === 'expired'
              ? 'Code expired. Request a new one.'
              : 'Too many attempts. Request a new code.',
      });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await M.update({
      where: { email: normalizedEmail },
      data: { passwordHash },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Change password confirm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── forgot password (logged out) ──────────────────────────────────────
// Always returns 200 so attackers can't enumerate registered emails.

router.post('/forgot-password/start', async (req, res) => {
  try {
    const { role, email } = req.body || {};
    if (modelFor(role) && email) {
      const normalizedEmail = normalize(email);
      const user = await modelFor(role).findUnique({
        where: { email: normalizedEmail },
      });
      if (user) {
        const issued = await otp.issue(
          'reset_password',
          role,
          normalizedEmail
        );
        // Silently absorb cooldown — user just sees the same generic message
        if (issued.code) {
          sendOtpEmail({
            to: normalizedEmail,
            code: issued.code,
            purpose: 'reset_password',
          }).catch((e) => console.error('OTP email error:', e));
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Forgot password start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/forgot-password/confirm', async (req, res) => {
  try {
    const { role, email, code, newPassword } = req.body || {};
    const M = modelFor(role);
    if (!M || !email || !code || !newPassword) {
      return res
        .status(400)
        .json({ error: 'role, email, code, and newPassword required' });
    }
    if (String(newPassword).length < 6) {
      return res
        .status(400)
        .json({ error: 'New password must be at least 6 characters' });
    }
    const normalizedEmail = normalize(email);
    const v = await otp.verify(
      'reset_password',
      role,
      normalizedEmail,
      code
    );
    if (!v.ok) {
      return res.status(400).json({
        error:
          v.error === 'invalid'
            ? `Invalid code${
                typeof v.attemptsLeft === 'number'
                  ? ` (${v.attemptsLeft} left)`
                  : ''
              }`
            : v.error === 'expired'
              ? 'Code expired. Request a new one.'
              : 'Too many attempts. Request a new code.',
      });
    }
    const user = await M.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      // Should be impossible at this point (OTP existed) but guard anyway
      return res.status(404).json({ error: 'Account not found' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await M.update({
      where: { email: normalizedEmail },
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt || new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Forgot password confirm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/2fa/toggle — turn 2FA on/off. Authenticated via session
// (citizen or institution) and re-confirmed with the current password.
router.post('/2fa/toggle', async (req, res) => {
  try {
    const sess = await session.read(req);
    if (!sess) return res.status(401).json({ error: 'Unauthorized' });
    const { enabled, currentPassword } = req.body || {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) required' });
    }
    if (!currentPassword) {
      return res.status(400).json({ error: 'currentPassword required' });
    }
    const M = modelFor(sess.role);
    const user = await M.findUnique({ where: { id: sess.userId } });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    await M.update({
      where: { id: user.id },
      data: { twoFactorEnabled: enabled },
    });
    res.json({ ok: true, twoFactorEnabled: enabled });
  } catch (err) {
    console.error('2FA toggle error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
