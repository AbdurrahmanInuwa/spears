require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const healthRouter = require('./routes/health');
const citizensRouter = require('./routes/citizens');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/health', healthRouter);
app.use('/api/citizens', citizensRouter);

app.get('/', (req, res) => {
  res.json({ name: 'SPAERS API', status: 'ok' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`SPAERS backend listening on http://localhost:${PORT}`);
});
