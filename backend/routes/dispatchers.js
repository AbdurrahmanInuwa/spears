const express = require('express');
const prisma = require('../lib/prisma');
const { generateUniqueDispatcherId } = require('../lib/spaersId');
const session = require('../lib/session');

const router = express.Router();
router.use(session.requireAuth('institution'));

const VALID_MODES = new Set(['vehicle', 'motorcycle', 'foot']);

function normalizeArr(v) {
  if (!Array.isArray(v)) return [];
  return v.map((s) => String(s).trim()).filter(Boolean);
}

async function getInstitution(req, res) {
  const inst = await prisma.institution.findUnique({
    where: { id: req.session.userId },
  });
  if (!inst) {
    res.status(404).json({ error: 'Institution not found' });
    return null;
  }
  return inst;
}

// GET /api/dispatchers?institutionEmail=…
router.get('/', async (req, res) => {
  try {
    const inst = await getInstitution(req, res);
    if (!inst) return;
    const dispatchers = await prisma.dispatcher.findMany({
      where: { institutionId: inst.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ dispatchers });
  } catch (err) {
    console.error('List dispatchers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/dispatchers
router.post('/', async (req, res) => {
  try {
    const inst = await getInstitution(req, res);
    if (!inst) return;
    const { name, emails, phones, mode } = req.body || {};
    if (!name || !mode) {
      return res
        .status(400)
        .json({ error: 'name and mode are required' });
    }
    if (!VALID_MODES.has(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    const cleanEmails = normalizeArr(emails);
    const cleanPhones = normalizeArr(phones);
    if (cleanEmails.length === 0 && cleanPhones.length === 0) {
      return res
        .status(400)
        .json({ error: 'Add at least one email or phone' });
    }

    const dispatcherId = await generateUniqueDispatcherId(prisma);

    const dispatcher = await prisma.dispatcher.create({
      data: {
        dispatcherId,
        institutionId: inst.id,
        name: String(name).trim(),
        emails: cleanEmails,
        phones: cleanPhones,
        mode,
      },
    });
    res.status(201).json({ dispatcher });
  } catch (err) {
    console.error('Create dispatcher error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/dispatchers/:id
router.patch('/:id', async (req, res) => {
  try {
    const inst = await getInstitution(req, res);
    if (!inst) return;
    const { id } = req.params;
    const existing = await prisma.dispatcher.findUnique({ where: { id } });
    if (!existing || existing.institutionId !== inst.id) {
      return res.status(404).json({ error: 'Not found' });
    }
    const { name, emails, phones, mode } = req.body || {};
    const data = {};
    if (typeof name === 'string') data.name = name.trim();
    if (Array.isArray(emails)) data.emails = normalizeArr(emails);
    if (Array.isArray(phones)) data.phones = normalizeArr(phones);
    if (typeof mode === 'string') {
      if (!VALID_MODES.has(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }
      data.mode = mode;
    }
    const updated = await prisma.dispatcher.update({
      where: { id },
      data,
    });
    res.json({ dispatcher: updated });
  } catch (err) {
    console.error('Update dispatcher error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/dispatchers/:id
router.delete('/:id', async (req, res) => {
  try {
    const inst = await getInstitution(req, res);
    if (!inst) return;
    const { id } = req.params;
    const existing = await prisma.dispatcher.findUnique({ where: { id } });
    if (!existing || existing.institutionId !== inst.id) {
      return res.status(404).json({ error: 'Not found' });
    }
    await prisma.dispatcher.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete dispatcher error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
