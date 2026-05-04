const Redis = require('ioredis');

const redis = global.__redis || new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
if (process.env.NODE_ENV !== 'production') global.__redis = redis;

module.exports = redis;
