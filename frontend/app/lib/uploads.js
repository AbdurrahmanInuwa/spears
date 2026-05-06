import { apiFetch } from './api';

// Two-step upload: ask backend to sign a PUT URL, then PUT the file directly
// to S3. Returns { key } on success, throws Error on failure.
export async function uploadToS3({ category, file, ownerId }) {
  if (!file) throw new Error('No file');
  const sign = await apiFetch('/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category,
      contentType: file.type,
      ownerId,
      sizeBytes: file.size,
    }),
  });
  const signData = await sign.json().catch(() => ({}));
  if (!sign.ok) throw new Error(signData.error || 'Failed to get upload URL');

  const put = await fetch(signData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return { key: signData.key };
}

// Cache resolved download URLs for the lifetime of the page (signed URLs
// are 24h-valid so this is fine). Returns the URL string or null on failure.
const _urlCache = new Map();
export async function getSignedDownloadUrl(key) {
  if (!key) return null;
  if (_urlCache.has(key)) return _urlCache.get(key);
  try {
    const res = await apiFetch(
      `/uploads/url?key=${encodeURIComponent(key)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) return null;
    _urlCache.set(key, data.url);
    return data.url;
  } catch {
    return null;
  }
}
