const crypto = require('crypto');
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } =
  require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.AWS_S3_BUCKET;

let client = null;
function getClient() {
  if (client) return client;
  if (!REGION || !BUCKET) return null;
  client = new S3Client({
    region: REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

function isConfigured() {
  return !!(REGION && BUCKET && process.env.AWS_ACCESS_KEY_ID);
}

// Build a deterministic-ish key under a folder, e.g.
//   avatars/<citizenId>/<random>.<ext>
function buildKey(folder, ownerId, contentType) {
  const ext = pickExtension(contentType);
  const rand = crypto.randomBytes(12).toString('hex');
  return `${folder}/${ownerId}/${rand}${ext}`;
}

function pickExtension(contentType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'application/pdf': '.pdf',
  };
  return map[String(contentType || '').toLowerCase()] || '';
}

// 5-minute upload window
async function getUploadUrl({ key, contentType }) {
  const c = getClient();
  if (!c) throw new Error('S3 not configured');
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(c, cmd, { expiresIn: 60 * 5 });
  return url;
}

// 24-hour download window
async function getDownloadUrl(key, expiresIn = 60 * 60 * 24) {
  const c = getClient();
  if (!c) throw new Error('S3 not configured');
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(c, cmd, { expiresIn });
}

async function deleteObject(key) {
  const c = getClient();
  if (!c) return;
  await c.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = {
  isConfigured,
  buildKey,
  getUploadUrl,
  getDownloadUrl,
  deleteObject,
};
