const express = require('express');
const prisma = require('../lib/prisma');
const session = require('../lib/session');
const { pointInPolygon } = require('../lib/geometry');

// Backend haversine — keep here so we don't depend on the frontend's lib
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
const { issueToken } = require('../lib/tokens');
const {
  notifyInstitution,
  notifyFamilyMembers,
  notifyVolunteer,
  pickMatchingVolunteers,
} = require('../lib/notify');
const realtime = require('../lib/realtime');

const router = express.Router();

// POST /api/emergencies — citizen triggers SOS. Body: { type, lat, lng }
router.post('/', session.requireAuth('citizen'), async (req, res) => {
  try {
    const citizenId = req.session.userId;
    const { type, lat, lng } = req.body || {};
    if (!type || typeof lat !== 'number' || typeof lng !== 'number') {
      return res
        .status(400)
        .json({ error: 'type, lat, and lng are required' });
    }

    const emergency = await prisma.emergency.create({
      data: {
        citizenId: citizenId || null,
        type: String(type),
        victimLat: lat,
        victimLng: lng,
        status: 'active',
      },
    });

    // Find institutions whose coverage polygon contains the victim
    const institutions = await prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        responseNumbers: true,
        responseEmails: true,
        coveragePolygon: true,
      },
    });
    const matched = institutions.filter((inst) =>
      pointInPolygon({ lat, lng }, inst.coveragePolygon || [])
    );

    // Build a "fat" emergency record once, matching the shape of /active so
    // each institution dashboard can render the new row without refetching.
    const broadcastable = await prisma.emergency.findUnique({
      where: { id: emergency.id },
      include: {
        citizen: {
          select: {
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
          },
        },
        dispatches: { take: 0 },
      },
    });

    // Issue a token per institution and fire notifications (fire-and-forget)
    for (const inst of matched) {
      const token = await issueToken(prisma, {
        emergencyId: emergency.id,
        audience: 'institution',
        audienceId: inst.id,
      });
      notifyInstitution({ emergency, institution: inst, token }).catch((err) =>
        console.error('notifyInstitution error:', err)
      );
      // Live push to the institution dashboard — new row appears instantly
      realtime.emitInstitutionEmergencyCreated(inst.id, broadcastable);
    }

    // Notify the triggerer's family (adult members, not the triggerer)
    let notifiedFamily = 0;
    if (citizenId) {
      const triggerer = await prisma.citizen.findUnique({
        where: { id: citizenId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          familyId: true,
        },
      });
      if (triggerer?.familyId) {
        const members = await prisma.citizen.findMany({
          where: { familyId: triggerer.familyId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            country: true,
            dob: true,
            familyCallEligible: true,
          },
        });
        notifiedFamily = members.filter((m) => m.id !== triggerer.id).length;
        notifyFamilyMembers({ emergency, triggerer, members }).catch((err) =>
          console.error('notifyFamilyMembers error:', err)
        );
      }
    }

    // Notify approved volunteers whose field matches this emergency type.
    // Each gets their own one-time token so when they open /v/<token>, the
    // backend can hydrate the page + record their accept/decline.
    let notifiedVolunteers = 0;
    try {
      const volunteers = await prisma.volunteer.findMany({
        where: { status: 'approved' },
        include: {
          citizen: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              country: true,
              dob: true,
            },
          },
        },
      });
      const matching = pickMatchingVolunteers(volunteers, emergency.type);
      notifiedVolunteers = matching.length;
      for (const v of matching) {
        const token = await issueToken(prisma, {
          emergencyId: emergency.id,
          audience: 'volunteer',
          audienceId: v.id,
          ttlMs: 6 * 60 * 60 * 1000, // 6h
        });
        notifyVolunteer({
          emergency,
          volunteer: v,
          citizen: v.citizen,
          token,
        }).catch((err) => console.error('notifyVolunteer error:', err));
      }
    } catch (err) {
      console.error('Volunteer fan-out error:', err);
    }

    res.status(201).json({
      emergency,
      notifiedInstitutions: matched.length,
      notifiedFamily,
      notifiedVolunteers,
    });
  } catch (err) {
    console.error('Create emergency error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emergencies/active-nearby?lat=&lng=&radiusKm=
// Public — returns the count + summary of active emergencies within radius
// of the given coordinates. Used by the marketing home page's safety card.
router.get('/active-nearby', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm) || 5;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' });
    }
    const radiusM = radiusKm * 1000;
    const active = await prisma.emergency.findMany({
      where: { status: { in: ['active', 'dispatched'] } },
      select: {
        id: true,
        type: true,
        victimLat: true,
        victimLng: true,
        createdAt: true,
      },
      take: 200,
    });
    const nearby = active
      .map((e) => ({
        ...e,
        distanceM: haversineMeters(
          { lat, lng },
          { lat: e.victimLat, lng: e.victimLng }
        ),
      }))
      .filter((e) => e.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM);
    res.json({ count: nearby.length, emergencies: nearby });
  } catch (err) {
    console.error('Active-nearby error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emergencies/active — active emergencies in this institution's coverage
router.get('/active', session.requireAuth('institution'), async (req, res) => {
  try {
    const inst = await prisma.institution.findUnique({
      where: { id: req.session.userId },
      select: { id: true, coveragePolygon: true },
    });
    if (!inst) return res.status(404).json({ error: 'Not found' });

    // Active = status != resolved/cancelled. Include the latest dispatch +
    // citizen bio so the institution UI can show victim info + status.
    const candidates = await prisma.emergency.findMany({
      where: { status: { in: ['active', 'dispatched'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        citizen: {
          select: {
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
          },
        },
        dispatches: {
          where: { institutionId: inst.id },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            dispatcher: {
              select: { name: true, dispatcherId: true },
            },
          },
        },
      },
    });
    const polygon = inst.coveragePolygon || [];
    const inCoverage = candidates.filter((e) =>
      pointInPolygon({ lat: e.victimLat, lng: e.victimLng }, polygon)
    );
    res.json({ emergencies: inCoverage });
  } catch (err) {
    console.error('Active emergencies error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emergencies/history — past emergencies in this institution's coverage
router.get('/history', session.requireAuth('institution'), async (req, res) => {
  try {
    const inst = await prisma.institution.findUnique({
      where: { id: req.session.userId },
      select: { id: true, coveragePolygon: true },
    });
    if (!inst) return res.status(404).json({ error: 'Not found' });

    const all = await prisma.emergency.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        dispatches: {
          where: { institutionId: inst.id },
          include: { dispatcher: true },
        },
      },
    });
    const polygon = inst.coveragePolygon || [];
    const inCoverage = all.filter((e) =>
      pointInPolygon({ lat: e.victimLat, lng: e.victimLng }, polygon)
    );
    res.json({ emergencies: inCoverage });
  } catch (err) {
    console.error('History emergencies error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/emergencies/:id — current state of a single emergency
router.get('/:id', session.requireAuth('citizen'), async (req, res) => {
  try {
    const citizenId = req.session.userId;
    const emergency = await prisma.emergency.findUnique({
      where: { id: req.params.id },
      include: {
        dispatches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            dispatcher: { select: { name: true, dispatcherId: true } },
          },
        },
      },
    });
    if (!emergency) return res.status(404).json({ error: 'Not found' });
    if (emergency.citizenId && emergency.citizenId !== citizenId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ emergency });
  } catch (err) {
    console.error('Get emergency error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/emergencies/:id/admin-token — mint a fresh institution token
router.post('/:id/admin-token', session.requireAuth('institution'), async (req, res) => {
  try {
    const inst = await prisma.institution.findUnique({
      where: { id: req.session.userId },
      select: { id: true, coveragePolygon: true },
    });
    if (!inst) return res.status(404).json({ error: 'Institution not found' });

    const emergency = await prisma.emergency.findUnique({
      where: { id: req.params.id },
    });
    if (!emergency) return res.status(404).json({ error: 'Emergency not found' });
    if (
      !pointInPolygon(
        { lat: emergency.victimLat, lng: emergency.victimLng },
        inst.coveragePolygon || []
      )
    ) {
      return res.status(403).json({ error: 'Out of coverage' });
    }

    const token = await issueToken(prisma, {
      emergencyId: emergency.id,
      audience: 'institution',
      audienceId: inst.id,
      ttlMs: 30 * 60 * 1000,
    });
    res.json({ token });
  } catch (err) {
    console.error('Admin token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
