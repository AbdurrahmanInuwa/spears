'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '../components/Toast';
import { API_URL, apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import OtpVerifyForm from '../components/OtpVerifyForm';

const tabs = ['Citizen', 'Institution'];

function tabFromParam(value) {
  if (!value) return 'Citizen';
  const v = String(value).toLowerCase();
  if (v === 'institution' || v === 'institutions') return 'Institution';
  if (v === 'citizen' || v === 'citizens') return 'Citizen';
  return 'Citizen';
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <SignInPageInner />
    </Suspense>
  );
}

function SignInPageInner() {
  const router = useRouter();
  const toast = useToast();
  const { refresh } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() =>
    tabFromParam(searchParams.get('tab'))
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 2FA state — set when /login returns { pending2FA: true }
  const [pending2FA, setPending2FA] = useState(null); // { role, email }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const role = activeTab.toLowerCase(); // 'citizen' | 'institution'
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, email: username, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 202 && data.pending2FA) {
        setSubmitting(false); // free the button before the screen swaps
        setPending2FA({ role: data.role, email: username.trim().toLowerCase() });
        toast('Verification code sent');
        return;
      }
      if (!res.ok) {
        toast(data.error || 'Login failed', { variant: 'error' });
        return;
      }
      // Single-factor success — server set the cookie, hydrate context
      await refresh();
      setSubmitting(false);
      toast(
        `Welcome back, ${data.user?.firstName || data.user?.name || ''}`.trim()
      );
      // Use whichever role the server confirms; fall back to the tab the
      // user was on if the response omitted it.
      const finalRole = data.role || role;
      if (finalRole === 'citizen') router.push('/dashboard');
      else if (finalRole === 'institution') router.push('/institution');
      else console.warn('login: unknown role in response', data);
    } catch (err) {
      console.error(err);
      toast('Network error. Is the server running?', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (pending2FA) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-8">
        <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 px-6 py-4">
            <h1 className="text-base font-bold text-slate-900">
              Two-factor sign-in
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Enter the 6-digit code we sent to{' '}
              <span className="font-semibold text-slate-700">{pending2FA.email}</span>.
            </p>
          </div>
          <div className="p-6">
            <OtpVerifyForm
              role={pending2FA.role}
              email={pending2FA.email}
              purpose="login_2fa"
              submitLabel="Sign in"
              submit={({ code }) =>
                apiFetch('/auth/verify-login-otp', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role: pending2FA.role,
                    email: pending2FA.email,
                    code,
                  }),
                })
              }
              onSuccess={async () => {
                await refresh();
                toast('Welcome back');
                if (pending2FA.role === 'citizen') router.push('/dashboard');
                else router.push('/institution');
              }}
            />
            <button
              type="button"
              onClick={() => setPending2FA(null)}
              className="mt-3 w-full text-center text-xs font-semibold text-slate-500 hover:text-brand"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        {/* Header — 2-tab grid */}
        <div className="grid grid-cols-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-brand text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Signing in…' : 'Login'}
          </button>

          <p className="pt-2 text-center text-xs text-slate-600">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-semibold text-brand hover:underline"
            >
              Create account now
            </Link>
          </p>
          <p className="text-center text-xs text-slate-500">
            <Link
              href={`/forgot-password?tab=${activeTab.toLowerCase()}`}
              className="hover:text-brand hover:underline"
            >
              Forgot password?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
