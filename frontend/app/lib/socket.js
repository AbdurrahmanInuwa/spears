'use client';

import { io } from 'socket.io-client';

// The socket server lives at the same host as the API, but socket.io
// connects to the ROOT (not /api). Strip the trailing /api if present.
function socketBase() {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
}

let _socket = null;

// Lazy singleton — first caller spins it up, everyone shares the same
// connection. `withCredentials: true` is what carries the session cookie
// to the upgrade request (so the server can identify the subscriber).
export function getSocket() {
  if (typeof window === 'undefined') return null;
  if (_socket && _socket.connected) return _socket;
  if (_socket) return _socket; // connecting — return the same instance
  _socket = io(socketBase(), {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });
  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
