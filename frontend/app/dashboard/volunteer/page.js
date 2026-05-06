'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../lib/api';
import { uploadToS3 } from '../../lib/uploads';

const FIELDS_OF_EMERGENCY = [
  'Medical / First Aid',
  'Fire & Rescue',
  'Search & Rescue',
  'Public Safety',
  'Disaster Relief',
  'Mental Health Support',
  'Hazmat / Environmental',
  'General',
];

export default function VolunteerPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [hydrated, setHydrated] = useState(false);
  const [volunteer, setVolunteer] = useState(null);

  // Form state
  const [field, setField] = useState('');
  const [idFile, setIdFile] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Load existing application from server
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/volunteers/me');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setVolunteer(data.volunteer);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!field) {
      toast('Choose a field of emergency', { variant: 'error' });
      return;
    }
    if (!idFile) {
      toast('Upload a valid government-issued ID', { variant: 'error' });
      return;
    }
    if (!agreed) {
      toast('Please acknowledge the terms', { variant: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      // Upload the ID file to S3 first
      let idFileKey = null;
      try {
        const up = await uploadToS3({
          category: 'volunteer-id',
          file: idFile,
          ownerId: user.id,
        });
        idFileKey = up.key;
      } catch (uploadErr) {
        toast(uploadErr.message || 'Could not upload ID', { variant: 'error' });
        return;
      }

      const res = await apiFetch('/volunteers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          idFileName: idFile?.name || null,
          idFileKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Could not submit', { variant: 'error' });
        return;
      }
      setVolunteer(data.volunteer);
      toast('Application submitted');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || !hydrated) return null;

  // Status banner if there's an existing application
  if (volunteer && volunteer.status !== 'revoked') {
    const isApproved = volunteer.status === 'approved';
    return (
      <div className="px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Volunteer</h1>
        <div
          className={`mt-6 max-w-2xl rounded-lg border p-6 shadow-sm ${
            isApproved
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <p
            className={`text-base font-semibold ${
              isApproved ? 'text-emerald-900' : 'text-amber-900'
            }`}
          >
            {isApproved
              ? 'You are an approved volunteer'
              : 'Your application is under review'}
          </p>
          <p
            className={`mt-2 text-sm ${
              isApproved ? 'text-emerald-800' : 'text-amber-800'
            }`}
          >
            {isApproved
              ? `Field: ${volunteer.field}. We may contact you when an emergency in your field needs help.`
              : "We'll notify you once it's been processed."}
          </p>
        </div>
      </div>
    );
  }

  // Application form (also shown if previously revoked — they can re-apply)
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-slate-900">Volunteer</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Help us keep your community safer. Become a trusted volunteer responder
        in your neighborhood.
      </p>

      {volunteer?.status === 'revoked' && (
        <div className="mt-4 max-w-2xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
          Your previous application was revoked. You may re-apply.
          {volunteer.decisionNote && (
            <span className="ml-1">Reason: {volunteer.decisionNote}</span>
          )}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-3xl space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Your information
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ReadOnlyField
              label="Name"
              value={`${user.firstName} ${user.lastName}`}
            />
            <ReadOnlyField label="Email" value={user.email} />
            <ReadOnlyField
              label="Date of birth"
              value={
                user.dob
                  ? new Date(user.dob).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: '2-digit',
                    })
                  : '—'
              }
            />
            <ReadOnlyField label="Phone" value={user.phone} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Field of emergency
            </label>
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">Select a field…</option>
              {FIELDS_OF_EMERGENCY.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Government-issued ID
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500 hover:border-brand hover:text-brand">
              <span className="truncate">
                {idFile ? idFile.name : 'Upload (driver license, ID, passport)'}
              </span>
              <span className="ml-3 rounded bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600 shadow-sm">
                Browse
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setIdFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span className="text-sm text-slate-700">
            By ticking this box, I confirm that the information I provide is
            true, that I am at least 18 years old, and that I agree to be
            contacted as a volunteer responder in emergencies through SPAERS.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting || !agreed}
          className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Register as volunteer'}
        </button>
      </form>
    </div>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-800">{value || '—'}</p>
    </div>
  );
}
