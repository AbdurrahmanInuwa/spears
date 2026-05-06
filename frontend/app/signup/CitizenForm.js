'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FormShell, { Field, inputClass } from './FormShell';
import { useToast } from '../components/Toast';
import { getCountries, getDialCode } from '../lib/countries';
import OtpVerifyForm from '../components/OtpVerifyForm';
import { API_URL as SHARED_API_URL } from '../lib/api';

const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const RAW = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
// Ensure URL ends with /api (works whether the env var includes it or not)
const API_URL = RAW.replace(/\/+$/, '').endsWith('/api')
  ? RAW.replace(/\/+$/, '')
  : `${RAW.replace(/\/+$/, '')}/api`;

export default function CitizenForm({ onBack }) {
  const router = useRouter();
  const toast = useToast();

  const countries = useMemo(() => getCountries(), []);
  const [pendingEmail, setPendingEmail] = useState(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    email: '',
    phone: '',
    country: '',
    hasAllergies: false,
    allergies: '',
    bloodGroup: '',
    hasChronicCondition: false,
    chronicCondition: '',
    implantDevice: false,
    password: '',
    confirmPassword: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function toggle(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.checked }));
  }

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast('Passwords do not match', { variant: 'error' });
      return;
    }
    if (form.password.length < 6) {
      toast('Password must be at least 6 characters', { variant: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/citizens/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          dob: form.dob,
          email: form.email,
          phone: form.phone,
          country: form.country || null,
          bloodGroup: form.bloodGroup || null,
          hasAllergies: form.hasAllergies,
          allergies: form.allergies,
          hasChronicCondition: form.hasChronicCondition,
          chronicCondition: form.chronicCondition,
          implantDevice: form.implantDevice,
          password: form.password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast(data.error || 'Failed to create account', { variant: 'error' });
        return;
      }

      // Show OTP step instead of redirecting straight to login
      setPendingEmail(form.email.trim().toLowerCase());
      toast('Verification code sent');
    } catch (err) {
      console.error(err);
      toast('Network error. Is the server running?', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingEmail) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-extrabold text-slate-900">
            Verify your email
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Almost done — enter the 6-digit code we just emailed you.
          </p>
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <OtpVerifyForm
              role="citizen"
              email={pendingEmail}
              purpose="signup"
              submitLabel="Verify & continue"
              submit={({ code }) =>
                fetch(`${SHARED_API_URL}/auth/verify-otp`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    role: 'citizen',
                    email: pendingEmail,
                    code,
                  }),
                })
              }
              onSuccess={() => {
                toast('Email verified');
                router.push('/signin?tab=citizen');
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <FormShell title="Citizen Account" onBack={onBack} onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input
            type="text"
            value={form.firstName}
            onChange={update('firstName')}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Last name">
          <input
            type="text"
            value={form.lastName}
            onChange={update('lastName')}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date of birth">
          <input
            type="date"
            value={form.dob}
            onChange={update('dob')}
            required
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={update('email')}
            required
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Country">
          <select
            value={form.country}
            onChange={update('country')}
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
        <Field label="Phone number">
          {(() => {
            const dialCode = getDialCode(form.country);
            return (
              <div className="flex items-stretch overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                {dialCode && (
                  <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600">
                    +{dialCode}
                  </span>
                )}
                <input
                  type="tel"
                  value={form.phone}
                  onChange={update('phone')}
                  placeholder={dialCode ? '700 000 000' : 'Select a country first'}
                  disabled={!dialCode}
                  required
                  className="w-full bg-transparent px-3 py-2 text-sm text-slate-900 outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>
            );
          })()}
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Blood group">
          <select
            value={form.bloodGroup}
            onChange={update('bloodGroup')}
            className={inputClass}
          >
            <option value="">Select…</option>
            {bloodGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          className={`rounded-lg border bg-slate-50 p-3 transition focus-within:border-brand focus-within:bg-white ${
            form.hasAllergies ? 'border-brand/40 bg-white' : 'border-slate-200'
          }`}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.hasAllergies}
              onChange={toggle('hasAllergies')}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Allergies
            </span>
          </label>
          <textarea
            rows={2}
            value={form.allergies}
            onChange={update('allergies')}
            disabled={!form.hasAllergies}
            placeholder={
              form.hasAllergies ? 'penicillin, peanuts' : 'Tick to add'
            }
            className="mt-2 w-full resize-none border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div
          className={`rounded-lg border bg-slate-50 p-3 transition focus-within:border-brand focus-within:bg-white ${
            form.hasChronicCondition
              ? 'border-brand/40 bg-white'
              : 'border-slate-200'
          }`}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.hasChronicCondition}
              onChange={toggle('hasChronicCondition')}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Chronic condition
            </span>
          </label>
          <textarea
            rows={2}
            value={form.chronicCondition}
            onChange={update('chronicCondition')}
            disabled={!form.hasChronicCondition}
            placeholder={
              form.hasChronicCondition ? 'asthma, diabetes' : 'Tick to add'
            }
            className="mt-2 w-full resize-none border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={form.implantDevice}
          onChange={(e) =>
            setForm((f) => ({ ...f, implantDevice: e.target.checked }))
          }
          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
        />
        I have an implanted medical device
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Password">
          <input
            type="password"
            value={form.password}
            onChange={update('password')}
            required
            minLength={6}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <Field label="Confirm password">
          <input
            type="password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            required
            minLength={6}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? 'Creating account…' : 'Create Account'}
      </button>
    </FormShell>
  );
}
