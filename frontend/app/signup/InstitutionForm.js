'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FormShell, { Field, inputClass } from './FormShell';
import AddressAutocomplete from '../components/AddressAutocomplete';
import InstitutionReview from './InstitutionReview';
import InstitutionCoverageEditor from './InstitutionCoverageEditor';
import InstitutionPassword from './InstitutionPassword';
import { useToast } from '../components/Toast';
import OtpVerifyForm from '../components/OtpVerifyForm';
import { getCountries, getDialCode } from '../lib/countries';
import { generateCirclePolygon } from '../lib/geometry';

const RAW = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const API_URL = RAW.replace(/\/+$/, '').endsWith('/api')
  ? RAW.replace(/\/+$/, '')
  : `${RAW.replace(/\/+$/, '')}/api`;

const DEFAULT_COVERAGE_RADIUS_M = 2000; // 2 km

const INSTITUTION_TYPES = [
  // Medical
  'Hospital',
  'Clinic',
  'Pharmacy',
  'Ambulance Hub',
  // Public safety
  'Police Station',
  'Fire Station',
  // Education
  'School',
  'University',
  'College',
  // Civic / public buildings
  'Government Office',
  'Embassy',
  'Place of Worship',
  // Commercial / public venues
  'Mall',
  'Stadium',
  'Hotel',
  'Airport',
  'Bus / Train Station',
  // Industrial
  'Factory',
  'Other',
];

export default function InstitutionForm({ onBack }) {
  const router = useRouter();
  const toast = useToast();
  const countries = useMemo(() => getCountries(), []);
  const [view, setView] = useState('form'); // 'form' | 'review' | 'coverage' | 'password' | 'otp'
  const [pendingEmail, setPendingEmail] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: '', // Hospital | Clinic | Police Station | Fire Station | Ambulance Hub | Other
    yearEstablished: '',
    country: '', // ISO 3166-1 alpha-2 (e.g. 'KE', 'US')
    address: '',
    addressLat: null,
    addressLng: null,
    addressPlaceId: null,
    centerLat: null, // user-confirmed center (may differ from Google's pin)
    centerLng: null,
    coveragePolygon: null, // Array<{lat,lng}>
    coverageRadiusM: DEFAULT_COVERAGE_RADIUS_M,
    coverageReason: null, // explanation if AI sized it
  });
  const dialCode = getDialCode(form.country);
  const [responseNumbers, setResponseNumbers] = useState(['']);
  const [responseEmails, setResponseEmails] = useState(['']);

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function updateList(setter) {
    return (idx, value) => {
      setter((list) => list.map((v, i) => (i === idx ? value : v)));
    };
  }

  function addToList(setter) {
    return () => setter((list) => [...list, '']);
  }

  function removeFromList(setter) {
    return (idx) => setter((list) => list.filter((_, i) => i !== idx));
  }

  const updateNumber = updateList(setResponseNumbers);
  const addNumber = addToList(setResponseNumbers);
  const removeNumber = removeFromList(setResponseNumbers);

  const updateEmail = updateList(setResponseEmails);
  const addEmail = addToList(setResponseEmails);
  const removeEmail = removeFromList(setResponseEmails);

  function handleSubmit(e) {
    e.preventDefault();
    // Step 1: validate, then move to the coverage-area review screen.
    if (!form.address) {
      toast('Please select an address', { variant: 'error' });
      return;
    }
    if (typeof form.addressLat !== 'number' || typeof form.addressLng !== 'number') {
      toast('Pick the address from the suggestions', { variant: 'error' });
      return;
    }

    if (!form.type) {
      toast('Please pick an institution type', { variant: 'error' });
      return;
    }
    if (!responseEmails.some((e) => e && e.trim())) {
      toast('Add at least one response email — the first one is your username', {
        variant: 'error',
      });
      return;
    }

    // Initialize center to Google's pin and generate the default polygon
    setForm((f) =>
      f.coveragePolygon
        ? f
        : {
            ...f,
            centerLat: f.centerLat ?? f.addressLat,
            centerLng: f.centerLng ?? f.addressLng,
            coveragePolygon: generateCirclePolygon(
              { lat: f.addressLat, lng: f.addressLng },
              DEFAULT_COVERAGE_RADIUS_M
            ),
          }
    );
    setView('review');
  }

  // Coverage-area "Confirm" simply moves to the password step.
  function handleCoverageConfirm() {
    setView('password');
  }

  // Password step "Create Account" → final submission.
  async function handleFinalSubmit(password) {
    const cleanedEmails = responseEmails
      .map((e) => e.trim())
      .filter(Boolean);
    if (cleanedEmails.length === 0) {
      toast('Add at least one response email (used as username)', {
        variant: 'error',
      });
      return;
    }
    const cleanedNumbers = responseNumbers
      .filter(Boolean)
      .map((n) =>
        dialCode ? `+${dialCode}${n.replace(/\D/g, '')}` : n.trim()
      );

    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        type: form.type,
        yearEstablished: form.yearEstablished
          ? Number(form.yearEstablished)
          : null,
        country: form.country,
        address: form.address,
        addressLat: form.addressLat,
        addressLng: form.addressLng,
        addressPlaceId: form.addressPlaceId,
        centerLat: form.centerLat ?? form.addressLat,
        centerLng: form.centerLng ?? form.addressLng,
        coveragePolygon: form.coveragePolygon,
        coverageReason: form.coverageReason,
        responseNumbers: cleanedNumbers,
        responseEmails: cleanedEmails,
        password,
      };

      const res = await fetch(`${API_URL}/institutions/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast(data.error || 'Failed to create account', { variant: 'error' });
        return;
      }

      // Move to OTP step instead of jumping to login
      setPendingEmail(cleanedEmails[0]);
      setView('otp');
      toast('Verification code sent');
    } catch (err) {
      console.error(err);
      toast('Network error. Is the server running?', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (view === 'coverage') {
    return (
      <InstitutionCoverageEditor
        center={{
          lat: form.centerLat ?? form.addressLat,
          lng: form.centerLng ?? form.addressLng,
        }}
        polygon={form.coveragePolygon || []}
        institution={{
          name: form.name,
          type: form.type,
          country: form.country,
          address: form.address,
        }}
        onCancel={() => setView('review')}
        onSave={({ center, polygon, radius_m, reason }) => {
          setForm((f) => ({
            ...f,
            centerLat: center?.lat ?? f.centerLat,
            centerLng: center?.lng ?? f.centerLng,
            coveragePolygon: polygon,
            coverageRadiusM: radius_m ?? f.coverageRadiusM,
            coverageReason: reason ?? f.coverageReason,
          }));
          setView('review');
        }}
      />
    );
  }

  if (view === 'review') {
    return (
      <InstitutionReview
        form={form}
        onBack={() => setView('form')}
        onEdit={() => setView('coverage')}
        onConfirm={handleCoverageConfirm}
        submitting={submitting}
      />
    );
  }

  if (view === 'password') {
    return (
      <InstitutionPassword
        onBack={() => setView('review')}
        onSubmit={handleFinalSubmit}
        submitting={submitting}
      />
    );
  }

  if (view === 'otp') {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-extrabold text-slate-900">
            Verify your email
          </h1>
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <OtpVerifyForm
              role="institution"
              email={pendingEmail}
              purpose="signup"
              submitLabel="Verify & continue"
              submit={({ code }) =>
                fetch(`${API_URL}/auth/verify-otp`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role: 'institution',
                    email: pendingEmail,
                    code,
                  }),
                })
              }
              onSuccess={() => {
                toast('Email verified');
                router.push('/signin?tab=institution');
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <FormShell
      title="Institution Account"
      onBack={onBack}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name of institution">
          <input
            type="text"
            value={form.name}
            onChange={update('name')}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Type">
          <select
            value={form.type}
            onChange={update('type')}
            required
            className={inputClass}
          >
            <option value="">Select type…</option>
            {INSTITUTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Year established">
          <input
            type="number"
            min="1800"
            max={new Date().getFullYear()}
            value={form.yearEstablished}
            onChange={update('yearEstablished')}
            className={inputClass}
          />
        </Field>
        <Field label="Country">
          <select
            value={form.country}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                country: e.target.value,
                // reset map data when the country changes
                address: '',
                addressLat: null,
                addressLng: null,
                addressPlaceId: null,
              }))
            }
            required
            className={inputClass}
          >
            <option value="">Select country…</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Address">
        <AddressAutocomplete
          value={form.address}
          onChange={(text) => setForm((f) => ({ ...f, address: text }))}
          onPlaceSelected={({ formattedAddress, lat, lng, placeId }) =>
            setForm((f) => ({
              ...f,
              address: formattedAddress,
              addressLat: lat ?? null,
              addressLng: lng ?? null,
              addressPlaceId: placeId ?? null,
            }))
          }
          countryCode={form.country || null}
          required
          placeholder={
            form.country
              ? "Start typing the institution's address…"
              : 'Select a country first'
          }
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Response numbers */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">
          Response number(s)
        </label>
        <div className="space-y-2">
          {responseNumbers.map((num, idx) => (
            <div key={idx} className="flex gap-2">
              <div className="flex flex-1 items-stretch overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                {dialCode && (
                  <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    +{dialCode}
                  </span>
                )}
                <input
                  type="tel"
                  value={num}
                  onChange={(e) => updateNumber(idx, e.target.value)}
                  placeholder={dialCode ? '700 000 000' : 'Select a country first'}
                  disabled={!dialCode}
                  className="w-full bg-transparent px-3 py-2 text-sm text-slate-900 outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
              {responseNumbers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeNumber(idx)}
                  className="rounded-md border border-slate-300 px-3 text-sm text-slate-500 hover:border-brand hover:text-brand"
                  aria-label="Remove number"
                >
                  −
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addNumber}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          + Add another number
        </button>
      </div>

      {/* Response emails */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">
          Response email(s){' '}
          <span className="font-normal text-slate-400">
            — first is your login username
          </span>
        </label>
        <div className="space-y-2">
          {responseEmails.map((email, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => updateEmail(idx, e.target.value)}
                placeholder={
                  idx === 0 ? 'login@example.org (username)' : 'response@example.org'
                }
                required={idx === 0}
                className={inputClass}
              />
              {responseEmails.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEmail(idx)}
                  className="rounded-md border border-slate-300 px-3 text-sm text-slate-500 hover:border-brand hover:text-brand"
                  aria-label="Remove email"
                >
                  −
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addEmail}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          + Add another email
        </button>
      </div>
      </div>

      <button
        type="submit"
        className="mt-2 w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark"
      >
        Create Account
      </button>
    </FormShell>
  );
}
