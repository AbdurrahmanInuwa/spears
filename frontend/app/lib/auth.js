'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiFetch } from './api';

const AuthCtx = createContext({
  user: null,
  role: null,
  loading: true,
  refresh: async () => {},
  setLocal: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, role: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch('/auth/me');
      if (res.ok) {
        const data = await res.json();
        setState({ user: data.user, role: data.role });
      } else {
        setState({ user: null, role: null });
      }
    } catch {
      setState({ user: null, role: null });
    } finally {
      setLoading(false);
    }
  }, []);

  // First-load hydration
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Optimistic local update — used after profile changes (e.g. avatar) so
  // the UI reflects the new value without a roundtrip.
  const setLocal = useCallback((patch) => {
    setState((s) => ({ ...s, user: { ...s.user, ...patch } }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {}
    setState({ user: null, role: null });
  }, []);

  return (
    <AuthCtx.Provider
      value={{ ...state, loading, refresh, setLocal, logout }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}

// Helper: compute age in years from a DOB (Date or ISO string)
export function ageFromDob(dob) {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
