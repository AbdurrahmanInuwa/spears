'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';

// Holds the full institution record (refetched from /api/institutions/me on
// mount, so newly-added schema fields are always present even if the cached
// auth user is stale). Components inside the institution dashboard should
// read from here, not from useAuth().user.
const InstitutionCtx = createContext({
  institution: null,
  loading: true,
  refresh: () => {},
});

export function InstitutionProvider({ children }) {
  const { user, role } = useAuth();
  const [institution, setInstitution] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.email || role !== 'institution') return;
    setLoading(true);
    try {
      const res = await apiFetch('/institutions/me');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setInstitution(data.institution);
    } finally {
      setLoading(false);
    }
  }, [user?.email, role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <InstitutionCtx.Provider value={{ institution, loading, refresh }}>
      {children}
    </InstitutionCtx.Provider>
  );
}

export function useInstitution() {
  return useContext(InstitutionCtx);
}
