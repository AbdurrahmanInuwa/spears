// Normalize the backend API URL — works whether NEXT_PUBLIC_API_URL ends
// with "/api" or not.
const RAW = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const stripped = RAW.replace(/\/+$/, '');
export const API_URL = stripped.endsWith('/api')
  ? stripped
  : `${stripped}/api`;

// All app fetches must use credentials so the session cookie travels.
// Accepts either a full URL or an API-relative path starting with '/'.
export function apiFetch(pathOrUrl, opts = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_URL}${pathOrUrl}`;
  return fetch(url, { credentials: 'include', ...opts });
}
