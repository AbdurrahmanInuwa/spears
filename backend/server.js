// override:true is needed because USER conflicts with the OS shell USER var
require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const healthRouter = require('./routes/health');
const citizensRouter = require('./routes/citizens');
const institutionsRouter = require('./routes/institutions');
const dispatchersRouter = require('./routes/dispatchers');
const emergenciesRouter = require('./routes/emergencies');
const publicRouter = require('./routes/public');
const authRouter = require('./routes/auth');
const aiRouter = require('./routes/ai');
const volunteersRouter = require('./routes/volunteers');
const familyRouter = require('./routes/family');
const uploadsRouter = require('./routes/uploads');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — must be credentials-aware so cookies travel cross-origin in dev.
// Multiple origins allowed via comma-separated CORS_ORIGIN env var.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      // Server-to-server / curl have no Origin header; allow them.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/health', healthRouter);
app.use('/api/citizens', citizensRouter);
app.use('/api/institutions', institutionsRouter);
app.use('/api/dispatchers', dispatchersRouter);
app.use('/api/emergencies', emergenciesRouter);
app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/ai', aiRouter);
app.use('/api/volunteers', volunteersRouter);
app.use('/api/family', familyRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/admin', adminRouter);

app.get('/', (req, res) => {
  res.json({ name: 'SPAERS API', status: 'ok' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const http = require('http');
const realtime = require('./lib/realtime');
const httpServer = http.createServer(app);
realtime.init(httpServer);
const server = httpServer.listen(PORT, () => {
  console.log(`SPAERS backend listening on http://localhost:${PORT}`);
});

// Release Prisma's connection pool on shutdown so nodemon restarts don't
// leak idle connections into Postgres.
const prisma = require('./lib/prisma');
async function shutdown() {
  await prisma.$disconnect().catch(() => {});
  server.close(() => process.exit(0));
  // Hard timeout in case server.close hangs
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGUSR2', async () => {
  // nodemon sends SIGUSR2 on restart
  await prisma.$disconnect().catch(() => {});
  process.kill(process.pid, 'SIGUSR2');
});
