const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { generateUniqueSpaersId } = require('../lib/spaersId');
const otp = require('../lib/otp');
const session = require('../lib/session');
const pendingSignup = require('../lib/pendingSignup');
const { sendOtpEmail } = require('../lib/notify');

const router = express.Router();

// Minimum age for self-registration. Under-13s should only appear in SPAERS
// as family members, added by an adult creator — never with their own login.
const MIN_AGE_YEARS = 13;
const MAX_AGE_YEARS = 120;

// Returns null if the DOB is acceptable, or an error string explaining why not.
function dobValidationError(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 'Invalid date of birth';
  const now = new Date();
  if (d > now) return 'Date of birth cannot be in the future';
  // Use calendar-aware year calculation to avoid leap-year off-by-one.
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
  if (years < MIN_AGE_YEARS) {
    return `You must be at least ${MIN_AGE_YEARS} years old to create an account.`;
  }
  if (years > MAX_AGE_YEARS) return 'Please enter a valid date of birth';
  return null;
}

// POST /api/citizens/signup
router.post('/signup', async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dob,
      email,
      phone,
      country,
      bloodGroup,
      hasAllergies,
      allergies,
      hasChronicCondition,
      chronicCondition,
      implantDevice,
      password,
    } = req.body || {};

    // Basic validation
    if (!firstName || !lastName || !dob || !email || !phone || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: ['firstName', 'lastName', 'dob', 'email', 'phone', 'password'],
      });
    }

    // Age gate (13+) — server-side enforcement, frontend can be bypassed.
    const dobErr = dobValidationError(dob);
    if (dobErr) return res.status(400).json({ error: dobErr });

    const normalizedEmail = String(email).trim().toLowerCase();

    // Duplicate-email check
    const existing = await prisma.citizen.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: 'An account with this email already exists' });
    }

    // Hash password now so the cleartext never sits in Redis
    const passwordHash = await bcrypt.hash(password, 10);

    // Stash the full payload in Redis under a 30-min key. Materialized to
    // Postgres only after the user verifies the OTP.
    await pendingSignup.stash('citizen', normalizedEmail, {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      dob: dob,
      email: normalizedEmail,
      phone: String(phone).trim(),
      country: country ? String(country).toUpperCase() : null,
      bloodGroup: bloodGroup || null,
      allergies: hasAllergies ? allergies || null : null,
      chronicCondition: hasChronicCondition
        ? chronicCondition || null
        : null,
      implantDevice: Boolean(implantDevice),
      passwordHash,
    });

    try {
      const issued = await otp.issue('signup', 'citizen', normalizedEmail);
      if (issued.code) {
        sendOtpEmail({
          to: normalizedEmail,
          code: issued.code,
          purpose: 'signup',
        }).catch((e) => console.error('OTP email error:', e));
      }
    } catch (e) {
      console.error('OTP issue error:', e);
    }

    res.status(201).json({ pendingVerification: true });
  } catch (err) {
    console.error('Citizen signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/citizens/me
// Permanently deletes the logged-in citizen's account. To prevent fat-finger
// disasters the client must echo the exact phrase "Delete my account" in the
// body. Cleanup order matters because of FK constraints:
//   1. Detach from any in-flight emergencies (preserve audit log via SetNull)
//   2. Hand off / dissolve the family if the deleted account was the creator
//   3. Delete the citizen (Volunteer cascades automatically per schema)
//   4. Best-effort S3 avatar cleanup (we can swallow failures here)
//   5. Destroy the session cookie + Redis entry
const s3 = require('../lib/s3');
router.delete('/me', session.requireAuth('citizen'), async (req, res) => {
  try {
    const { confirmation } = req.body || {};
    if (confirmation !== 'Delete my account') {
      return res.status(400).json({
        error: 'Type "Delete my account" exactly to confirm.',
      });
    }
    const me = await prisma.citizen.findUnique({
      where: { id: req.session.userId },
      select: { id: true, familyId: true, avatarKey: true },
    });
    if (!me) return res.status(404).json({ error: 'Account not found' });

    // 1. Detach from emergencies — Emergency.citizenId is nullable so we
    //    keep the historical record without orphaning a hard FK.
    await prisma.emergency.updateMany({
      where: { citizenId: me.id },
      data: { citizenId: null },
    });

    // 2. Family handoff
    if (me.familyId) {
      const fam = await prisma.family.findUnique({
        where: { id: me.familyId },
        include: { members: { select: { id: true, createdAt: true } } },
      });
      if (fam) {
        const others = fam.members.filter((m) => m.id !== me.id);
        if (others.length === 0) {
          // Sole member — detach me first so the FK doesn't block deletion,
          // then nuke the empty family row.
          await prisma.citizen.update({
            where: { id: me.id },
            data: { familyId: null },
          });
          await prisma.family.delete({ where: { id: fam.id } });
        } else if (fam.creatorId === me.id) {
          // I was the creator — promote the longest-tenured surviving member
          // so the family doesn't lose its admin.
          const successor = others
            .slice()
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
          await prisma.family.update({
            where: { id: fam.id },
            data: { creatorId: successor.id },
          });
        }
      }
    }

    // 3. Delete the citizen (Volunteer cascades per schema)
    await prisma.citizen.delete({ where: { id: me.id } });

    // 4. Best-effort avatar cleanup
    if (me.avatarKey) {
      s3.deleteObject(me.avatarKey).catch(() => {});
    }

    // 5. Burn the session
    await session.destroy(req, res);

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete citizen/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/citizens/me/avatar
// Body: { avatarKey }  // pass null to remove
router.patch('/me/avatar', session.requireAuth('citizen'), async (req, res) => {
  try {
    const { avatarKey } = req.body || {};
    const me = await prisma.citizen.findUnique({ where: { id: req.session.userId } });
    if (!me) return res.status(404).json({ error: 'Citizen not found' });

    // If replacing/removing, best-effort delete the old object
    if (me.avatarKey && me.avatarKey !== avatarKey) {
      s3.deleteObject(me.avatarKey).catch(() => {});
    }
    const updated = await prisma.citizen.update({
      where: { id: me.id },
      data: { avatarKey: avatarKey || null },
      select: { id: true, avatarKey: true },
    });
    res.json({ citizen: updated });
  } catch (err) {
    console.error('Update avatar error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/citizens/by-spaers-id/:id
router.get('/by-spaers-id/:id', session.requireAuth('citizen'), async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!/^\d{10}$/.test(id)) {
      return res.status(400).json({ error: 'SPAERS ID must be 10 digits' });
    }
    const candidate = await prisma.citizen.findUnique({
      where: { spaersId: id },
      select: {
        id: true,
        spaersId: true,
        firstName: true,
        lastName: true,
        dob: true,
        email: true,
        phone: true,
        country: true,
        bloodGroup: true,
        familyId: true,
      },
    });
    if (!candidate) return res.status(404).json({ error: 'No citizen with that SPAERS ID' });

    const currentId = req.session.userId;
    if (candidate.id === currentId) {
      return res.status(400).json({ error: "That's your own SPAERS ID" });
    }
    if (candidate.familyId) {
      const caller = await prisma.citizen.findUnique({
        where: { id: currentId },
        select: { familyId: true },
      });
      if (!caller || caller.familyId !== candidate.familyId) {
        return res.status(409).json({
          error: 'The user you are trying to add has been added to another family',
        });
      }
    }
    res.json({ citizen: candidate });
  } catch (err) {
    console.error('Lookup by SPAERS ID error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
