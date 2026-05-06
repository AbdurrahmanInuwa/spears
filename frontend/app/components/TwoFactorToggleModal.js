'use client';

import { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { apiFetch } from '../lib/api';

// Confirm with current password before flipping the 2FA flag.
// Used on Citizen Profile and Institution Settings.
export default function TwoFactorToggleModal({
  currentlyEnabled,
  onClose,
  onChanged,
}) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const action = currentlyEnabled ? 'Disable' : 'Enable';
  const actionLow = action.toLowerCase();

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/auth/2fa/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: !currentlyEnabled,
          currentPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || `Could not ${actionLow} 2FA`, { variant: 'error' });
        return;
      }
      toast(
        currentlyEnabled
          ? 'Two-factor auth disabled'
          : 'Two-factor auth enabled'
      );
      onChanged?.(data.twoFactorEnabled);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {action} two-factor auth
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {currentlyEnabled
                ? "We'll stop asking for an email code on sign-in."
                : "After every sign-in, we'll email a 6-digit code you must enter to finish."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Current password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="off"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !currentPassword}
            className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? `${action.slice(0, -1)}ing…` : action}
          </button>
        </form>
      </div>
    </div>
  );
}
