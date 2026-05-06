'use client';

import { useEffect, useState } from 'react';
import OtpVerifyForm from './OtpVerifyForm';
import { useToast } from './Toast';
import { apiFetch } from '../lib/api';

// 2-step modal: enter current + new password → OTP → done.
// props:
//   role: 'citizen' | 'institution'
//   email: current account email
//   onClose, onChanged
export default function ChangePasswordModal({ role, email, onClose, onChanged }) {
  const toast = useToast();
  const [step, setStep] = useState('passwords'); // 'passwords' | 'otp'
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function startChange(e) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast('Password must be at least 6 characters', { variant: 'error' });
      return;
    }
    if (newPassword !== confirm) {
      toast('New passwords do not match', { variant: 'error' });
      return;
    }
    if (newPassword === currentPassword) {
      toast('New password must differ from the current one', {
        variant: 'error',
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/auth/change-password/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, email, currentPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Could not start change', { variant: 'error' });
        return;
      }
      toast('Verification code sent');
      setStep('otp');
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
              {step === 'passwords' ? 'Change password' : 'Confirm with code'}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {step === 'passwords'
                ? "We'll email you a 6-digit code to confirm."
                : `Code sent to ${email}.`}
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

        {step === 'passwords' ? (
          <form onSubmit={startChange} className="space-y-4 px-5 py-5">
            <PasswordField
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="off"
            />
            <PasswordField
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={
                submitting ||
                !currentPassword ||
                !newPassword ||
                !confirm
              }
              className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Sending code…' : 'Continue'}
            </button>
          </form>
        ) : (
          <div className="px-5 py-5">
            <OtpVerifyForm
              role={role}
              email={email}
              purpose="change_password"
              submitLabel="Update password"
              submit={({ code }) =>
                apiFetch('/auth/change-password/confirm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role,
                    email,
                    code,
                    newPassword,
                  }),
                })
              }
              onSuccess={() => {
                toast('Password updated');
                onChanged?.();
                onClose();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={6}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
      />
    </div>
  );
}
