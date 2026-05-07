'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toast';
import { useAuth } from '../lib/auth';
import { apiFetch } from '../lib/api';

const CONFIRM_PHRASE = 'Delete my account';

// Hard delete the logged-in citizen. The backend requires the user to echo
// the exact phrase, and we also gate the button locally so a fat-finger on
// "Enter" doesn't nuke the account.
export default function DeleteAccountModal({ onClose }) {
  const router = useRouter();
  const toast = useToast();
  const { logout } = useAuth();
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const matches = phrase === CONFIRM_PHRASE;

  async function handleDelete(e) {
    e.preventDefault();
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch('/citizens/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: CONFIRM_PHRASE }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Could not delete account', { variant: 'error' });
        setSubmitting(false);
        return;
      }
      // Server already cleared the cookie — drop local auth state and
      // route to the landing page. Don't toast first; the redirect should
      // feel immediate.
      await logout();
      router.replace('/');
    } catch (err) {
      console.error('Delete account error:', err);
      toast('Network error. Please try again.', { variant: 'error' });
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-rose-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600"
              aria-hidden="true"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">Delete account</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                This permanently removes your account and cannot be undone.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleDelete} className="space-y-4 px-5 py-5">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">You will lose:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>Your SPAERS ID and medical profile</li>
              <li>
                Family membership (if you created the family, it transfers to
                another member)
              </li>
              <li>Volunteer status, if any</li>
              <li>Profile photo</li>
            </ul>
            <p className="mt-2 text-slate-500">
              Past emergency records are kept anonymously for audit purposes.
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm-phrase"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Type{' '}
              <span className="font-mono font-semibold text-rose-700">
                {CONFIRM_PHRASE}
              </span>{' '}
              to confirm
            </label>
            <input
              id="confirm-phrase"
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={submitting}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-60"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matches || submitting}
              className="flex-1 rounded-md bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
