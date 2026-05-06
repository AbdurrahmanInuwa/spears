'use client';

import { useState } from 'react';
import { useToast } from '../components/Toast';

export default function InstitutionPassword({ onBack, onSubmit, submitting }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) {
      toast('Password must be at least 6 characters', { variant: 'error' });
      return;
    }
    if (password !== confirmPassword) {
      toast('Passwords do not match', { variant: 'error' });
      return;
    }
    onSubmit(password);
  }

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-extrabold text-slate-900">
          Set a Password
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          You&apos;ll use this to sign in alongside your institution&apos;s
          email.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label
              htmlFor="ins-password"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="ins-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label
              htmlFor="ins-confirm-password"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Confirm password
            </label>
            <input
              id="ins-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
