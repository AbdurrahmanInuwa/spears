const express = require('express');
const prisma = require('../lib/prisma');
const session = require('../lib/session');

const router = express.Router();
router.use(session.requireAuth('citizen'));

// POST /api/volunteers/apply
// Body: { citizenId, field, idFileName }
// Creates or updates the volunteer application for a citizen. Status starts
// 'pending' on first apply and resets to 'pending' if they re-apply after a
// revocation (admin must re-approve).
router.post('/apply', async (req, res) => {
  try {
    const citizenId = req.session.userId;
    const { field, idFileName, idFileKey } = req.body || {};
    if (!field) {
      return res.status(400).json({ error: 'field required' });
    }
    const citizen = await prisma.citizen.findUnique({ where: { id: citizenId } });
    if (!citizen) return res.status(404).json({ error: 'Citizen not found' });

    const existing = await prisma.volunteer.findUnique({ where: { citizenId } });
    let volunteer;
    if (existing) {
      volunteer = await prisma.volunteer.update({
        where: { citizenId },
        data: {
          field: String(field).trim(),
          idFileName: idFileName ? String(idFileName).slice(0, 200) : existing.idFileName,
          idFileKey: idFileKey ? String(idFileKey).slice(0, 500) : existing.idFileKey,
          status: 'pending',
          decisionNote: null,
          decidedAt: null,
        },
      });
    } else {
      volunteer = await prisma.volunteer.create({
        data: {
          citizenId,
          field: String(field).trim(),
          idFileName: idFileName ? String(idFileName).slice(0, 200) : null,
          idFileKey: idFileKey ? String(idFileKey).slice(0, 500) : null,
          status: 'pending',
        },
      });
    }
    res.status(201).json({ volunteer });
  } catch (err) {
    console.error('Volunteer apply error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/volunteers/me
router.get('/me', async (req, res) => {
  try {
    const volunteer = await prisma.volunteer.findUnique({
      where: { citizenId: req.session.userId },
    });
    res.json({ volunteer: volunteer || null });
  } catch (err) {
    console.error('Volunteer me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
