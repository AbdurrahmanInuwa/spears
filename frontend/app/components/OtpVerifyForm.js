'use client';

import { useEffect, useState } from 'react';
import OtpInput from './OtpInput';
import { useToast } from './Toast';
import { apiFetch } from '../lib/api';

// Reusable verify-OTP form. Used by signup, change-password, forgot-password.
//
// props:
// - role: 'citizen' | 'institution'
// - email: target email
// - purpose: 'signup' | 'change_password' | 'reset_password'
// - submit({ code }): async fn — caller decides what to do with the code
//   (e.g. call /verify-otp, /change-password/confirm, etc.)
// - onSuccess(): fires after submit() returns successfully
// - extraBeforeSubmit?: optional UI rendered above the OTP input (e.g.
//   "new password" fields for change/reset flows)
// - extraGetPayload?: () => object — additional fields merged into submit input
// - submitLabel: button text
export default function OtpVerifyForm({
  role,
  email,
  purpose,
  submit,
  onSuccess,
  submitLabel = 'Verify',
  extraBefore = null,
  extraValid = true,
  showResend = true,
}) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (code.length < 6) {
      toast('Enter the 6-digit code', { variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await submit({ code });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Verification failed', { variant: 'error' });
        return;
      }
      onSuccess?.();
    } catch (err) {
      console.error(err);
      toast('Network error', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setResending(true);
    try {
      const res = await apiFetch('/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, email, purpose }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Could not resend', { variant: 'error' });
        if (data.retryInS) setCooldown(data.retryInS);
        return;
      }
      toast('New code sent');
      setCooldown(60);
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-slate-600">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-slate-800">{email}</span>.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          The code expires in 10 minutes.
        </p>
      </div>

      {extraBefore}

      <div>
        <label className="mb-2 block text-xs font-medium text-slate-700">
          Verification code
        </label>
        <OtpInput value={code} onChange={setCode} length={6} />
      </div>

      <button
        type="submit"
        disabled={submitting || code.length < 6 || !extraValid}
        className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Verifying…' : submitLabel}
      </button>

      {showResend && (
        <p className="text-center text-xs text-slate-500">
          Didn&apos;t get it?{' '}
          {cooldown > 0 ? (
            <span className="text-slate-400">Resend in {cooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-semibold text-brand hover:underline disabled:opacity-60"
            >
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </p>
      )}
    </form>
  );
}
