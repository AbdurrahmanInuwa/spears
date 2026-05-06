const express = require('express');
const s3 = require('../lib/s3');

const router = express.Router();

// Per-category constraints. The browser uploads directly to S3 with the
// signed URL, but ContentType/MaxSize are enforced by what we sign.
const CATEGORIES = {
  avatar: {
    folder: 'avatars',
    allowed: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
    maxBytes: 2 * 1024 * 1024, // 2 MB
  },
  'volunteer-id': {
    folder: 'volunteer-ids',
    allowed: new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
    ]),
    maxBytes: 5 * 1024 * 1024, // 5 MB
  },
};

// POST /api/uploads/sign
// Body: { category, contentType, ownerId, sizeBytes }
// Returns: { uploadUrl, key }
router.post('/sign', async (req, res) => {
  try {
    if (!s3.isConfigured()) {
      return res.status(503).json({ error: 'Uploads not configured' });
    }
    const { category, contentType, ownerId, sizeBytes } = req.body || {};
    const meta = CATEGORIES[category];
    if (!meta) return res.status(400).json({ error: 'Invalid category' });
    if (!ownerId) return res.status(400).json({ error: 'ownerId required' });
    if (!contentType || !meta.allowed.has(String(contentType).toLowerCase())) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    if (sizeBytes && Number(sizeBytes) > meta.maxBytes) {
      return res.status(400).json({
        error: `File too large (max ${(meta.maxBytes / 1024 / 1024).toFixed(0)} MB)`,
      });
    }
    const key = s3.buildKey(meta.folder, String(ownerId), contentType);
    const uploadUrl = await s3.getUploadUrl({ key, contentType });
    res.json({ uploadUrl, key });
  } catch (err) {
    console.error('Sign upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/uploads/url?key= — short-lived signed download URL
router.get('/url', async (req, res) => {
  try {
    if (!s3.isConfigured()) {
      return res.status(503).json({ error: 'Uploads not configured' });
    }
    const key = String(req.query.key || '').trim();
    if (!key) return res.status(400).json({ error: 'key required' });
    const url = await s3.getDownloadUrl(key);
    res.json({ url });
  } catch (err) {
    console.error('Get download URL error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
