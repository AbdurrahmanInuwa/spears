'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '../components/Toast';
import OtpVerifyForm from '../components/OtpVerifyForm';
import { API_URL } from '../lib/api';

const tabs = ['Citizen', 'Institution'];

function tabFromParam(value) {
  if (!value) return 'Citizen';
  const v = String(value).toLowerCase();
  if (v === 'institution' || v === 'institutions') return 'Institution';
  return 'Citizen';
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}

function ForgotPasswordInner() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(() =>
    tabFromParam(searchParams.get('tab'))
  );
  const [step, setStep] = useState('email'); // 'email' | 'reset'
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const role = activeTab.toLowerCase();
  const passwordsValid =
    newPassword.length >= 6 && newPassword === confirm;

  async function startReset(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      // Always 200 — backend never reveals whether the email exists
      await fetch(`${API_URL}/auth/forgot-password/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, email: email.trim().toLowerCase() }),
      });
      toast('If that email exists, a code was sent.');
      setStep('reset');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="grid grid-cols-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setStep('email');
                }}
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

        <div className="space-y-4 p-6">
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Reset your password
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {step === 'email'
                ? "Enter your email and we'll send you a 6-digit code."
                : 'Enter the code from your email and choose a new password.'}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={startReset} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              <button
                type="submit"
                disabled={submitting || !email}
                className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Sending code…' : 'Send code'}
              </button>
            </form>
          ) : (
            <OtpVerifyForm
              role={role}
              email={email.trim().toLowerCase()}
              purpose="reset_password"
              submitLabel="Reset password"
              extraValid={passwordsValid}
              extraBefore={
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      New password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Confirm new password
                    </label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                    />
                  </div>
                </div>
              }
              submit={({ code }) =>
                fetch(`${API_URL}/auth/forgot-password/confirm`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role,
                    email: email.trim().toLowerCase(),
                    code,
                    newPassword,
                  }),
                })
              }
              onSuccess={() => {
                toast('Password updated');
                router.push(`/signin?tab=${role}`);
              }}
            />
          )}

          <p className="pt-2 text-center text-xs text-slate-600">
            Remembered it?{' '}
            <Link
              href={`/signin?tab=${role}`}
              className="font-semibold text-brand hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
