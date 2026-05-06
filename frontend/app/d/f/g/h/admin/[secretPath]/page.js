'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL } from '../../../../../../lib/api';

const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH;
const TOKEN_KEY = 'spaers_admin_token_v1';

export default function AdminLoginPage() {
  const router = useRouter();
  const { secretPath } = useParams();
  const [secret, setSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // The URL segment must match the env path. Anything else 404s.
  useEffect(() => {
    if (!ADMIN_PATH || secretPath !== ADMIN_PATH) {
      notFound();
    }
  }, [secretPath]);

  // If already authenticated, jump straight to the console
  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? window.localStorage.getItem(TOKEN_KEY)
      : null;
    if (!token) return;
    (async () => {
      const res = await fetch(`${API_URL}/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) router.replace(`/d/f/g/h/admin/${secretPath}/console`);
    })();
  }, [router, secretPath]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid secret');
        return;
      }
      window.localStorage.setItem(TOKEN_KEY, data.token);
      router.replace(`/d/f/g/h/admin/${secretPath}/console`);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-extrabold tracking-tight text-brand">
            SPAERS
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Admin
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-xl"
        >
          <label className="mb-2 block text-xs font-medium text-slate-700">
            Secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          {error && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !secret}
            className="mt-4 w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Verifying…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
