const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const otp = require('../lib/otp');
const session = require('../lib/session');
const { sendOtpEmail } = require('../lib/notify');

const router = express.Router();

// PATCH /api/institutions/me — update editable fields (settings page)
router.patch('/me', session.requireAuth('institution'), async (req, res) => {
  try {
    const inst = await prisma.institution.findUnique({
      where: { id: req.session.userId },
    });
    if (!inst) return res.status(404).json({ error: 'Not found' });

    const {
      name,
      type,
      yearEstablished,
      country,
      address,
      addressLat,
      addressLng,
      addressPlaceId,
      centerLat,
      centerLng,
      coveragePolygon,
      coverageReason,
      responseNumbers,
      responseEmails,
    } = req.body || {};

    const data = {};
    if (typeof name === 'string') data.name = name.trim();
    if (typeof type === 'string') data.type = type.trim();
    if (yearEstablished !== undefined)
      data.yearEstablished = yearEstablished
        ? Number(yearEstablished) || null
        : null;
    if (typeof country === 'string') data.country = country.toUpperCase();
    if (typeof address === 'string') data.address = address.trim();
    if (typeof addressLat === 'number') data.addressLat = addressLat;
    if (typeof addressLng === 'number') data.addressLng = addressLng;
    if (typeof addressPlaceId === 'string') data.addressPlaceId = addressPlaceId;
    if (typeof centerLat === 'number') data.centerLat = centerLat;
    if (typeof centerLng === 'number') data.centerLng = centerLng;
    if (Array.isArray(coveragePolygon))
      data.coveragePolygon = coveragePolygon;
    if (typeof coverageReason === 'string') data.coverageReason = coverageReason;
    if (Array.isArray(responseNumbers))
      data.responseNumbers = responseNumbers
        .map((n) => String(n).trim())
        .filter(Boolean);
    if (Array.isArray(responseEmails))
      data.responseEmails = responseEmails
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean);

    const updated = await prisma.institution.update({
      where: { id: inst.id },
      data,
    });
    res.json({ institution: updated });
  } catch (err) {
    console.error('Update institution/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/institutions/me — full record for the logged-in institution
router.get('/me', session.requireAuth('institution'), async (req, res) => {
  try {
    const inst = await prisma.institution.findUnique({
      where: { id: req.session.userId },
      select: {
        id: true,
        name: true,
        type: true,
        yearEstablished: true,
        country: true,
        address: true,
        addressLat: true,
        addressLng: true,
        addressPlaceId: true,
        centerLat: true,
        centerLng: true,
        coveragePolygon: true,
        coverageReason: true,
        responseNumbers: true,
        responseEmails: true,
        email: true,
        twoFactorEnabled: true,
      },
    });
    if (!inst) return res.status(404).json({ error: 'Not found' });
    res.json({ institution: inst });
  } catch (err) {
    console.error('Get institution/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Backend haversine helper
function haversineMeters(p1, p2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// GET /api/institutions/nearby-summary?lat=&lng=&radiusKm=
// Public — used by the marketing home page's "Nearby Help" card.
router.get('/nearby-summary', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm) || 15;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    const radiusM = radiusKm * 1000;
    const all = await prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        centerLat: true,
        centerLng: true,
      },
    });
    const within = all
      .map((i) => ({
        ...i,
        distanceM: haversineMeters(
          { lat, lng },
          { lat: i.centerLat, lng: i.centerLng }
        ),
      }))
      .filter((i) => i.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM);

    const byType = {};
    for (const i of within) byType[i.type] = (byType[i.type] || 0) + 1;
    const nearestHospital = within.find(
      (i) => /hospital|clinic|ambulance/i.test(i.type)
    );
    res.json({
      total: within.length,
      byType,
      nearestHospital: nearestHospital
        ? {
            id: nearestHospital.id,
            name: nearestHospital.name,
            type: nearestHospital.type,
            distanceM: Math.round(nearestHospital.distanceM),
          }
        : null,
      list: within.slice(0, 30),
    });
  } catch (err) {
    console.error('Nearby summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/institutions
// Returns all registered institutions with their coverage polygon + center.
// Used by the SOS pulse to find responders whose coverage area intersects
// the victim's expanding alert radius.
router.get('/', async (req, res) => {
  try {
    const institutions = await prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        address: true,
        country: true,
        centerLat: true,
        centerLng: true,
        coveragePolygon: true,
      },
    });
    res.json({ institutions });
  } catch (err) {
    console.error('List institutions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/institutions/signup
router.post('/signup', async (req, res) => {
  try {
    const {
      name,
      type,
      yearEstablished,
      country,
      address,
      addressLat,
      addressLng,
      addressPlaceId,
      centerLat,
      centerLng,
      coveragePolygon,
      coverageReason,
      responseNumbers,
      responseEmails,
      password,
    } = req.body || {};

    // Required-field validation
    if (!name || !type || !country || !address || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        fields: ['name', 'type', 'country', 'address', 'password'],
      });
    }
    if (typeof centerLat !== 'number' || typeof centerLng !== 'number') {
      return res
        .status(400)
        .json({ error: 'Coverage center coordinates are required' });
    }
    if (!Array.isArray(coveragePolygon) || coveragePolygon.length < 3) {
      return res
        .status(400)
        .json({ error: 'Coverage polygon must have at least 3 points' });
    }
    if (!Array.isArray(responseEmails)) {
      return res.status(400).json({ error: 'responseEmails must be an array' });
    }

    const emails = responseEmails
      .map((e) => String(e).trim().toLowerCase())
      .filter(Boolean);
    if (emails.length === 0) {
      return res
        .status(400)
        .json({ error: 'At least one response email is required' });
    }
    const loginEmail = emails[0];

    const numbers = Array.isArray(responseNumbers)
      ? responseNumbers.map((n) => String(n).trim()).filter(Boolean)
      : [];

    // Duplicate-username (email) check
    const existing = await prisma.institution.findUnique({
      where: { email: loginEmail },
    });
    if (existing) {
      return res.status(409).json({
        error: 'An institution with this email already exists',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const institution = await prisma.institution.create({
      data: {
        name: String(name).trim(),
        type: String(type).trim(),
        yearEstablished: yearEstablished
          ? Number(yearEstablished) || null
          : null,
        country: String(country).toUpperCase(),
        address: String(address).trim(),
        addressLat: typeof addressLat === 'number' ? addressLat : null,
        addressLng: typeof addressLng === 'number' ? addressLng : null,
        addressPlaceId: addressPlaceId || null,
        centerLat,
        centerLng,
        coveragePolygon, // Json
        coverageReason: coverageReason || null,
        responseNumbers: numbers,
        responseEmails: emails,
        email: loginEmail,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        type: true,
        createdAt: true,
      },
    });

    try {
      const issued = await otp.issue('signup', 'institution', loginEmail);
      if (issued.code) {
        sendOtpEmail({
          to: loginEmail,
          code: issued.code,
          purpose: 'signup',
        }).catch((e) => console.error('OTP email error:', e));
      }
    } catch (e) {
      console.error('OTP issue error:', e);
    }

    res.status(201).json({ institution, pendingVerification: true });
  } catch (err) {
    console.error('Institution signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
