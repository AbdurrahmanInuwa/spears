// socket.io server. Subscribers (citizen + institution browsers) connect,
// authenticate via the existing session cookie, and join rooms keyed by
// emergency id. The dispatcher's location is pushed in via REST and we
// fan out the event to every subscriber in the room.
const { Server } = require('socket.io');
const cookie = require('cookie');
const prisma = require('./prisma');
const session = require('./session');
const { pointInPolygon } = require('./geometry');

let io = null;

function init(httpServer) {
  if (io) return io;
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // Each connection is a single browser tab. We auth once via the cookie
    // attached to the upgrade request, then handle subscribe/unsubscribe.
    socket.on('subscribe:emergency', async (payload, ack) => {
      try {
        const { emergencyId, scope } = payload || {};
        if (!emergencyId || !scope) {
          return ack?.({ error: 'emergencyId and scope required' });
        }
        const sess = await readCookieSession(socket);
        if (!sess) return ack?.({ error: 'Unauthorized' });

        const emergency = await prisma.emergency.findUnique({
          where: { id: emergencyId },
          select: {
            id: true,
            citizenId: true,
            victimLat: true,
            victimLng: true,
          },
        });
        if (!emergency) return ack?.({ error: 'Not found' });

        if (scope === 'citizen') {
          if (sess.role !== 'citizen' || sess.userId !== emergency.citizenId) {
            return ack?.({ error: 'Forbidden' });
          }
        } else if (scope === 'institution') {
          if (sess.role !== 'institution') {
            return ack?.({ error: 'Forbidden' });
          }
          const inst = await prisma.institution.findUnique({
            where: { id: sess.userId },
            select: { coveragePolygon: true },
          });
          const inside = pointInPolygon(
            { lat: emergency.victimLat, lng: emergency.victimLng },
            inst?.coveragePolygon || []
          );
          if (!inside) return ack?.({ error: 'Out of coverage' });
        } else {
          return ack?.({ error: 'Invalid scope' });
        }

        const room = roomKey(emergencyId);
        socket.join(room);
        ack?.({ ok: true });
      } catch (err) {
        console.error('subscribe:emergency error:', err);
        ack?.({ error: 'Internal server error' });
      }
    });

    socket.on('unsubscribe:emergency', ({ emergencyId } = {}) => {
      if (emergencyId) socket.leave(roomKey(emergencyId));
    });

    // Institution dashboards subscribe to one room — their own — so they
    // get notified the moment a new emergency is created in their coverage,
    // dispatched, or resolved. No body needed: we identify the institution
    // from the session cookie.
    socket.on('subscribe:institution', async (_payload, ack) => {
      try {
        const sess = await readCookieSession(socket);
        if (!sess || sess.role !== 'institution') {
          return ack?.({ error: 'Unauthorized' });
        }
        socket.join(institutionRoom(sess.userId));
        ack?.({ ok: true });
      } catch (err) {
        console.error('subscribe:institution error:', err);
        ack?.({ error: 'Internal server error' });
      }
    });
    socket.on('unsubscribe:institution', async () => {
      const sess = await readCookieSession(socket);
      if (sess?.role === 'institution') {
        socket.leave(institutionRoom(sess.userId));
      }
    });
  });

  return io;
}

function get() {
  return io;
}

function roomKey(emergencyId) {
  return `emergency:${emergencyId}`;
}

function institutionRoom(institutionId) {
  return `institution:${institutionId}`;
}

function emitDispatcherPosition(emergencyId, payload) {
  if (!io) return;
  // Include the id in the broadcast so multi-room subscribers (e.g. the
  // institution dashboard watching N emergencies) can route to the right
  // pin in their state.
  io.to(roomKey(emergencyId)).emit('dispatcher:position', {
    ...payload,
    emergencyId,
  });
}

function emitEmergencyResolved(emergencyId, institutionIds = []) {
  if (!io) return;
  io.to(roomKey(emergencyId)).emit('emergency:resolved', { emergencyId });
  // Also tell every institution that had it on their list, so the row drops
  for (const id of institutionIds || []) {
    io.to(institutionRoom(id)).emit('emergency:resolved', { emergencyId });
  }
}

// Tell a specific institution there's a new emergency in their coverage.
function emitInstitutionEmergencyCreated(institutionId, emergency) {
  if (!io) return;
  io.to(institutionRoom(institutionId)).emit('emergency:created', emergency);
}

// Tell a specific institution one of their visible emergencies changed
// (e.g. a dispatcher was sent, status flipped to 'dispatched', etc.)
function emitInstitutionEmergencyUpdated(institutionId, emergency) {
  if (!io) return;
  io.to(institutionRoom(institutionId)).emit('emergency:updated', emergency);
}

// Helper — read session from the upgrade-request cookies. We can't reuse
// the express middleware directly because socket.io doesn't pass req/res.
async function readCookieSession(socket) {
  const raw = socket.handshake.headers?.cookie;
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  const fakeReq = { cookies: parsed };
  return session.read(fakeReq);
}

module.exports = {
  init,
  get,
  emitDispatcherPosition,
  emitEmergencyResolved,
  emitInstitutionEmergencyCreated,
  emitInstitutionEmergencyUpdated,
};
