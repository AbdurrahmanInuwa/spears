const express = require('express');
const prisma = require('../lib/prisma');
const session = require('../lib/adminSession');
const s3 = require('../lib/s3');

const router = express.Router();

// ─── auth ───────────────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { secret } = req.body || {};
    const expected = process.env.ADMIN_SECRET;
    if (!expected) {
      return res.status(503).json({ error: 'Admin not configured' });
    }
    if (!secret || !session.timingSafeEqual(secret, expected)) {
      // Small artificial delay to slow brute force attempts
      await new Promise((r) => setTimeout(r, 400));
      return res.status(401).json({ error: 'Invalid secret' });
    }
    const { token, ttlS } = await session.createSession();
    res.json({ token, ttlS });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', session.requireAdmin, async (req, res) => {
  await session.destroySession(req.adminToken);
  res.json({ ok: true });
});

// Cheap "still valid?" probe so the admin console can boot
router.get('/me', session.requireAdmin, async (req, res) => {
  res.json({ ok: true });
});

// ─── citizens ───────────────────────────────────────────────────────────

router.get('/citizens', session.requireAdmin, async (req, res) => {
  try {
    const citizens = await prisma.citizen.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        spaersId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        country: true,
        bloodGroup: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    res.json({ citizens });
  } catch (err) {
    console.error('Admin list citizens error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/citizens/:id', session.requireAdmin, async (req, res) => {
  try {
    const c = await prisma.citizen.findUnique({
      where: { id: req.params.id },
      include: {
        family: { include: { members: { select: { id: true, firstName: true, lastName: true, spaersId: true } } } },
        volunteer: true,
      },
    });
    if (!c) return res.status(404).json({ error: 'Not found' });
    const { passwordHash: _ph, ...safe } = c;
    // Sign avatar URL for the modal
    let avatarUrl = null;
    if (c.avatarKey) {
      try {
        avatarUrl = await s3.getDownloadUrl(c.avatarKey, 60 * 60);
      } catch {}
    }
    res.json({ citizen: { ...safe, avatarUrl } });
  } catch (err) {
    console.error('Admin get citizen error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── institutions ───────────────────────────────────────────────────────

router.get('/institutions', session.requireAdmin, async (req, res) => {
  try {
    const institutions = await prisma.institution.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        country: true,
        address: true,
        email: true,
        responseNumbers: true,
        responseEmails: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    res.json({ institutions });
  } catch (err) {
    console.error('Admin list institutions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/institutions/:id', session.requireAdmin, async (req, res) => {
  try {
    const i = await prisma.institution.findUnique({
      where: { id: req.params.id },
      include: {
        dispatchers: {
          select: {
            id: true,
            dispatcherId: true,
            name: true,
            mode: true,
            emails: true,
            phones: true,
          },
        },
      },
    });
    if (!i) return res.status(404).json({ error: 'Not found' });
    const { passwordHash: _ph, ...safe } = i;
    res.json({
      institution: {
        ...safe,
        dispatcherCount: safe.dispatchers?.length || 0,
      },
    });
  } catch (err) {
    console.error('Admin get institution error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── volunteers ─────────────────────────────────────────────────────────

router.get('/volunteers', session.requireAdmin, async (req, res) => {
  try {
    const status = req.query.status; // optional filter
    const where = status ? { status: String(status) } : {};
    const volunteers = await prisma.volunteer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        citizen: {
          select: {
            id: true,
            spaersId: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            country: true,
            dob: true,
          },
        },
      },
    });
    res.json({ volunteers });
  } catch (err) {
    console.error('Admin list volunteers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/volunteers/:id/id-file-url — short-lived signed URL for the
// volunteer's uploaded govt-id (image or PDF). Returns 404 if no file.
router.get('/volunteers/:id/id-file-url', session.requireAdmin, async (req, res) => {
  try {
    const v = await prisma.volunteer.findUnique({
      where: { id: req.params.id },
      select: { idFileKey: true, idFileName: true },
    });
    if (!v?.idFileKey) return res.status(404).json({ error: 'No file' });
    const url = await s3.getDownloadUrl(v.idFileKey, 60 * 60);
    res.json({ url, fileName: v.idFileName });
  } catch (err) {
    console.error('Admin id file url error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/volunteers/:id/approve', session.requireAdmin, async (req, res) => {
  try {
    const { decisionNote } = req.body || {};
    const v = await prisma.volunteer.update({
      where: { id: req.params.id },
      data: {
        status: 'approved',
        decisionNote: decisionNote ? String(decisionNote).slice(0, 500) : null,
        decidedAt: new Date(),
      },
    });
    res.json({ volunteer: v });
  } catch (err) {
    console.error('Admin approve volunteer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/volunteers/:id/revoke', session.requireAdmin, async (req, res) => {
  try {
    const { decisionNote } = req.body || {};
    const v = await prisma.volunteer.update({
      where: { id: req.params.id },
      data: {
        status: 'revoked',
        decisionNote: decisionNote ? String(decisionNote).slice(0, 500) : null,
        decidedAt: new Date(),
      },
    });
    res.json({ volunteer: v });
  } catch (err) {
    console.error('Admin revoke volunteer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
