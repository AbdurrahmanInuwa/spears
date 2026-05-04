const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

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

    const passwordHash = await bcrypt.hash(password, 10);

    const citizen = await prisma.citizen.create({
      data: {
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        dob: new Date(dob),
        email: normalizedEmail,
        phone: String(phone).trim(),
        bloodGroup: bloodGroup || null,
        allergies: hasAllergies ? allergies || null : null,
        chronicCondition: hasChronicCondition ? chronicCondition || null : null,
        implantDevice: Boolean(implantDevice),
        passwordHash,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        createdAt: true,
      },
    });

    res.status(201).json({ citizen });
  } catch (err) {
    console.error('Citizen signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
