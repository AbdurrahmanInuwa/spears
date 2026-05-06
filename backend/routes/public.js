// Token-authenticated routes for emergency responders. Each route validates
// a single-use token; possession of the token IS the authorization.
const express = require('express');
const prisma = require('../lib/prisma');
const { resolveToken, consumeToken, issueToken } = require('../lib/tokens');
const { notifyDispatcher } = require('../lib/notify');
const realtime = require('../lib/realtime');
const redis = require('../lib/redis');

const POSITION_RATE_LIMIT_MS = 2000;

const router = express.Router();

// GET /api/public/e/:token
// Hydrates the institution responder's view: emergency details + the list
// of dispatchers belonging to the matched institution.
router.get('/e/:token', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'institution') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    const [institution, dispatchers] = await Promise.all([
      prisma.institution.findUnique({
        where: { id: t.audienceId },
        select: {
          id: true,
          name: true,
          centerLat: true,
          centerLng: true,
          coveragePolygon: true,
        },
      }),
      prisma.dispatcher.findMany({
        where: { institutionId: t.audienceId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    res.json({
      emergency: t.emergency,
      institution,
      dispatchers,
    });
  } catch (err) {
    console.error('Public /e error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/e/:token/dispatch
// Body: { dispatcherId }
// The institution responder picks a dispatcher; we mint a new dispatcher-
// audience token and notify them. The original institution token is consumed.
router.post('/e/:token/dispatch', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'institution') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    const { dispatcherId } = req.body || {};
    if (!dispatcherId) {
      return res.status(400).json({ error: 'dispatcherId required' });
    }
    const dispatcher = await prisma.dispatcher.findUnique({
      where: { id: dispatcherId },
    });
    if (!dispatcher || dispatcher.institutionId !== t.audienceId) {
      return res.status(404).json({ error: 'Dispatcher not found' });
    }

    // Mint dispatcher token (longer TTL — may take a while to arrive)
    const dispatcherToken = await issueToken(prisma, {
      emergencyId: t.emergencyId,
      audience: 'dispatcher',
      audienceId: dispatcher.id,
      ttlMs: 6 * 60 * 60 * 1000, // 6h
    });

    // Record the dispatch + advance emergency status
    const [dispatch] = await Promise.all([
      prisma.emergencyDispatch.create({
        data: {
          emergencyId: t.emergencyId,
          institutionId: t.audienceId,
          dispatcherId: dispatcher.id,
        },
      }),
      prisma.emergency.update({
        where: { id: t.emergencyId },
        data: { status: 'dispatched' },
      }),
      consumeToken(prisma, t.id),
    ]);

    // Fire-and-forget notifications
    notifyDispatcher({
      emergency: t.emergency,
      dispatcher,
      token: dispatcherToken,
    }).catch((err) => console.error('notifyDispatcher error:', err));

    // Push the updated emergency to this institution's dashboard so the
    // status pill flips to "Dispatcher notified" instantly.
    try {
      const fresh = await prisma.emergency.findUnique({
        where: { id: t.emergencyId },
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
            where: { institutionId: t.audienceId },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              dispatcher: { select: { name: true, dispatcherId: true } },
            },
          },
        },
      });
      realtime.emitInstitutionEmergencyUpdated(t.audienceId, fresh);
    } catch (e) {
      console.error('Realtime updated emit error:', e);
    }

    res.json({ ok: true, dispatchId: dispatch.id });
  } catch (err) {
    console.error('Dispatch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/d/:token
// Hydrates the dispatcher's nav view.
router.get('/d/:token', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'dispatcher') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    const [dispatcher, dispatch, emergency] = await Promise.all([
      prisma.dispatcher.findUnique({ where: { id: t.audienceId } }),
      prisma.emergencyDispatch.findFirst({
        where: { emergencyId: t.emergencyId, dispatcherId: t.audienceId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.emergency.findUnique({
        where: { id: t.emergencyId },
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
        },
      }),
    ]);
    res.json({ emergency, dispatcher, dispatch });
  } catch (err) {
    console.error('Public /d error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/d/:token/start
// Dispatcher tapped Start; we mark the dispatch as started but DON'T
// consume the token (they may need to refresh the page mid-route).
router.post('/d/:token/start', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'dispatcher') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    const dispatch = await prisma.emergencyDispatch.findFirst({
      where: { emergencyId: t.emergencyId, dispatcherId: t.audienceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    if (!dispatch.startedAt) {
      await prisma.emergencyDispatch.update({
        where: { id: dispatch.id },
        data: { startedAt: new Date() },
      });
      // Push the updated emergency to the dispatching institution so the
      // status pill flips to "On the way" without waiting for the next poll.
      try {
        const fresh = await prisma.emergency.findUnique({
          where: { id: t.emergencyId },
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
              where: { institutionId: dispatch.institutionId },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                dispatcher: { select: { name: true, dispatcherId: true } },
              },
            },
          },
        });
        realtime.emitInstitutionEmergencyUpdated(
          dispatch.institutionId,
          fresh
        );
      } catch (e) {
        console.error('Realtime updated emit error:', e);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/d/:token/position
// Body: { lat, lng, headingDeg?, speedKmh? }
// Dispatcher's browser pings this with their live coords. Stored in Redis
// (5-min TTL) and broadcast via socket.io to subscribers of this emergency.
router.post('/d/:token/position', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'dispatcher') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    const { lat, lng, headingDeg, speedKmh } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng required' });
    }

    // Per-token rate limit (one ping every POSITION_RATE_LIMIT_MS)
    const rateKey = `pos_rate:${t.id}`;
    const set = await redis.set(
      rateKey,
      '1',
      'PX',
      POSITION_RATE_LIMIT_MS,
      'NX'
    );
    if (set === null) {
      // Throttled — just acknowledge silently to keep the dispatcher quiet.
      return res.status(204).end();
    }

    const payload = {
      lat,
      lng,
      headingDeg: typeof headingDeg === 'number' ? headingDeg : null,
      speedKmh: typeof speedKmh === 'number' ? speedKmh : null,
      ts: Date.now(),
      dispatcherId: t.audienceId,
    };
    await redis.set(
      `emergency_pos:${t.emergencyId}`,
      JSON.stringify(payload),
      'EX',
      5 * 60
    );
    realtime.emitDispatcherPosition(t.emergencyId, payload);
    res.status(204).end();
  } catch (err) {
    console.error('Public position error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/public/d/position/:emergencyId  (used by subscribers on connect to
// hydrate the last-known position so the pin appears immediately, even if
// the next ping is 1–2s away). Cookie-authenticated.
router.get('/position/:emergencyId', async (req, res) => {
  try {
    const sess = await require('../lib/session').read(req);
    if (!sess) return res.status(401).json({ error: 'Unauthorized' });
    const raw = await redis.get(`emergency_pos:${req.params.emergencyId}`);
    if (!raw) return res.json({ position: null });
    res.json({ position: JSON.parse(raw) });
  } catch (err) {
    console.error('Get position error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/public/d/:token/arrived
// Dispatcher reports they're on scene → marks the dispatch arrived and
// resolves the emergency. Token stays valid until expiry.
router.post('/d/:token/arrived', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'dispatcher') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    const dispatch = await prisma.emergencyDispatch.findFirst({
      where: { emergencyId: t.emergencyId, dispatcherId: t.audienceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
    const now = new Date();
    await Promise.all([
      prisma.emergencyDispatch.update({
        where: { id: dispatch.id },
        data: { arrivedAt: dispatch.arrivedAt || now },
      }),
      prisma.emergency.update({
        where: { id: t.emergencyId },
        data: { status: 'resolved', resolvedAt: now },
      }),
    ]);
    // Tell every subscriber the loop is done + drop the cached position.
    // Also notify each institution that had this emergency so its row
    // disappears from their active list.
    const dispatchInstitutions = await prisma.emergencyDispatch.findMany({
      where: { emergencyId: t.emergencyId },
      select: { institutionId: true },
    });
    const institutionIds = [
      ...new Set(dispatchInstitutions.map((d) => d.institutionId)),
    ];
    realtime.emitEmergencyResolved(t.emergencyId, institutionIds);
    redis.del(`emergency_pos:${t.emergencyId}`).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.error('Arrived error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Volunteer (/v/:token) endpoints ────────────────────────────────────

router.get('/v/:token', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'volunteer') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    const volunteer = await prisma.volunteer.findUnique({
      where: { id: t.audienceId },
      include: {
        citizen: { select: { firstName: true, lastName: true } },
      },
    });
    res.json({
      emergency: t.emergency,
      volunteer: volunteer
        ? {
            id: volunteer.id,
            field: volunteer.field,
            name: `${volunteer.citizen?.firstName || ''} ${volunteer.citizen?.lastName || ''}`.trim(),
          }
        : null,
    });
  } catch (err) {
    console.error('Public /v error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/v/:token/accept', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'volunteer') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    await prisma.emergencyNotification.create({
      data: {
        emergencyId: t.emergencyId,
        audience: 'volunteer',
        audienceId: t.audienceId,
        channel: 'response',
        recipient: '',
        status: 'accepted',
        payload: { ts: Date.now() },
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Volunteer accept error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/v/:token/decline', async (req, res) => {
  try {
    const t = await resolveToken(prisma, req.params.token);
    if (!t || t._invalidReason) {
      return res.status(404).json({ error: t?._invalidReason || 'Invalid token' });
    }
    if (t.audience !== 'volunteer') {
      return res.status(403).json({ error: 'Wrong audience' });
    }
    await prisma.emergencyNotification.create({
      data: {
        emergencyId: t.emergencyId,
        audience: 'volunteer',
        audienceId: t.audienceId,
        channel: 'response',
        recipient: '',
        status: 'declined',
        payload: { ts: Date.now() },
      },
    });
    await consumeToken(prisma, t.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Volunteer decline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
