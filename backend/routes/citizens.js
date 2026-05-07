const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { generateUniqueSpaersId } = require('../lib/spaersId');
const otp = require('../lib/otp');
const session = require('../lib/session');
const pendingSignup = require('../lib/pendingSignup');
const { sendOtpEmail } = require('../lib/notify');

const router = express.Router();

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

// PATCH /api/citizens/me/avatar
// Body: { avatarKey }  // pass null to remove
const s3 = require('../lib/s3');
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
