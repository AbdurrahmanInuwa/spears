const express = require('express');
const prisma = require('../lib/prisma');
const session = require('../lib/session');

const router = express.Router();
router.use(session.requireAuth('citizen'));

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

const memberSelect = {
  id: true,
  spaersId: true,
  firstName: true,
  lastName: true,
  dob: true,
  email: true,
  phone: true,
  country: true,
  bloodGroup: true,
  allergies: true,
  chronicCondition: true,
  implantDevice: true,
  familyCallEligible: true,
};

async function getCitizen(req, res) {
  const c = await prisma.citizen.findUnique({ where: { id: req.session.userId } });
  if (!c) {
    res.status(404).json({ error: 'Citizen not found' });
    return null;
  }
  return c;
}

// POST /api/family/ack — citizen acknowledges family terms
router.post('/ack', async (req, res) => {
  try {
    const me = await getCitizen(req, res);
    if (!me) return;
    if (me.familyAckAt) {
      return res.json({ ok: true, familyAckAt: me.familyAckAt });
    }
    const updated = await prisma.citizen.update({
      where: { id: me.id },
      data: { familyAckAt: new Date() },
      select: { familyAckAt: true },
    });
    res.json({ ok: true, familyAckAt: updated.familyAckAt });
  } catch (err) {
    console.error('Family ack error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/family/me?citizenId= — current citizen's family + members
router.get('/me', async (req, res) => {
  try {
    const me = await getCitizen(req, res);
    if (!me) return;
    if (!me.familyId) {
      return res.json({
        ackAt: me.familyAckAt,
        family: null,
        members: [],
      });
    }
    const family = await prisma.family.findUnique({
      where: { id: me.familyId },
      select: { id: true, creatorId: true },
    });
    const members = await prisma.citizen.findMany({
      where: { familyId: me.familyId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
    res.json({
      ackAt: me.familyAckAt,
      family,
      members,
    });
  } catch (err) {
    console.error('Family me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/family/me/members — add a member by SPAERS ID
router.post('/me/members', async (req, res) => {
  try {
    const me = await getCitizen(req, res);
    if (!me) return;

    // Adults only can initiate a new family. Under-18s can only be added.
    const myAge = ageFromDob(me.dob);
    if (myAge != null && myAge < 18 && !me.familyId) {
      return res.status(403).json({
        error: 'Family must be started by an adult member.',
      });
    }
    if (!me.familyAckAt) {
      return res.status(403).json({
        error: 'You must acknowledge the family terms first.',
      });
    }

    const spaersId = String(req.body?.spaersId || '').trim();
    if (!/^\d{10}$/.test(spaersId)) {
      return res.status(400).json({ error: 'SPAERS ID must be 10 digits' });
    }
    if (me.spaersId === spaersId) {
      return res.status(400).json({ error: "That's your own SPAERS ID" });
    }

    const candidate = await prisma.citizen.findUnique({
      where: { spaersId },
    });
    if (!candidate) {
      return res.status(404).json({ error: 'No citizen with that SPAERS ID' });
    }
    if (
      candidate.familyId &&
      candidate.familyId !== me.familyId
    ) {
      return res.status(409).json({
        error:
          'The user you are trying to add has been added to another family',
      });
    }

    // Lazily create my family on first add. The first adder is the creator.
    let familyId = me.familyId;
    if (!familyId) {
      const fam = await prisma.family.create({ data: { creatorId: me.id } });
      familyId = fam.id;
      await prisma.citizen.update({
        where: { id: me.id },
        data: { familyId },
      });
    }

    if (candidate.familyId !== familyId) {
      await prisma.citizen.update({
        where: { id: candidate.id },
        data: { familyId },
      });
    }

    const members = await prisma.citizen.findMany({
      where: { familyId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
    res.status(201).json({ family: { id: familyId }, members });
  } catch (err) {
    console.error('Add family member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/family/me/members/:memberId
router.delete('/me/members/:memberId', async (req, res) => {
  try {
    const me = await getCitizen(req, res);
    if (!me) return;
    if (!me.familyId) {
      return res.status(404).json({ error: 'You are not in a family' });
    }
    const memberId = req.params.memberId;
    if (memberId === me.id) {
      return res
        .status(400)
        .json({ error: "You can't remove yourself from your family." });
    }
    const target = await prisma.citizen.findUnique({
      where: { id: memberId },
      select: { id: true, familyId: true },
    });
    if (!target || target.familyId !== me.familyId) {
      return res.status(404).json({ error: 'Member not in your family' });
    }
    await prisma.citizen.update({
      where: { id: memberId },
      data: { familyId: null, familyCallEligible: false },
    });
    // If only the caller is left, dissolve the family record
    const remaining = await prisma.citizen.count({
      where: { familyId: me.familyId },
    });
    if (remaining <= 1) {
      await prisma.citizen.update({
        where: { id: me.id },
        data: { familyId: null, familyCallEligible: false },
      });
      await prisma.family.delete({ where: { id: me.familyId } }).catch(() => {});
    }
    const members = me.familyId
      ? await prisma.citizen.findMany({
          where: { familyId: me.familyId },
          select: memberSelect,
          orderBy: { createdAt: 'asc' },
        })
      : [];
    res.json({ ok: true, members });
  } catch (err) {
    console.error('Remove family member error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/family/me/call-config — creator-only. Body: { memberIds: [<id>] }
// (max 2). Sets familyCallEligible=true for the listed members and false
// for everyone else in the family.
router.patch('/me/call-config', async (req, res) => {
  try {
    const me = await getCitizen(req, res);
    if (!me) return;
    if (!me.familyId) return res.status(404).json({ error: 'No family' });
    const family = await prisma.family.findUnique({
      where: { id: me.familyId },
      select: { creatorId: true },
    });
    if (!family || family.creatorId !== me.id) {
      return res.status(403).json({ error: 'Only the family creator can configure this' });
    }
    const { memberIds } = req.body || {};
    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'memberIds (array) required' });
    }
    if (memberIds.length > 2) {
      return res.status(400).json({ error: 'You can pick at most 2 members' });
    }

    // Validate every id belongs to this family AND is not the creator
    const valid = await prisma.citizen.findMany({
      where: { familyId: me.familyId, id: { in: memberIds } },
      select: { id: true },
    });
    if (valid.length !== memberIds.length) {
      return res
        .status(400)
        .json({ error: 'One or more members are not in your family' });
    }
    if (memberIds.includes(me.id)) {
      return res
        .status(400)
        .json({ error: "You can't put yourself on the call list" });
    }

    // Atomic toggle: clear all in family, then set the chosen
    await prisma.$transaction([
      prisma.citizen.updateMany({
        where: { familyId: me.familyId },
        data: { familyCallEligible: false },
      }),
      ...(memberIds.length
        ? [
            prisma.citizen.updateMany({
              where: { id: { in: memberIds } },
              data: { familyCallEligible: true },
            }),
          ]
        : []),
    ]);
    const members = await prisma.citizen.findMany({
      where: { familyId: me.familyId },
      select: memberSelect,
      orderBy: { createdAt: 'asc' },
    });
    res.json({ members });
  } catch (err) {
    console.error('Family call-config error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
