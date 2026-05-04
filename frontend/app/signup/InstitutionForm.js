'use client';

import { useMemo, useState } from 'react';
import FormShell, { Field, inputClass } from './FormShell';
import AddressAutocomplete from '../components/AddressAutocomplete';
import InstitutionReview from './InstitutionReview';
import InstitutionCoverageEditor from './InstitutionCoverageEditor';
import { useToast } from '../components/Toast';
import { getCountries, getDialCode } from '../lib/countries';
import { generateCirclePolygon } from '../lib/geometry';

const DEFAULT_COVERAGE_RADIUS_M = 2000; // 2 km

export default function InstitutionForm({ onBack }) {
  const toast = useToast();
  const countries = useMemo(() => getCountries(), []);
  const [view, setView] = useState('form'); // 'form' | 'review' | 'coverage'
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    yearEstablished: '',
    country: '', // ISO 3166-1 alpha-2 (e.g. 'KE', 'US')
    address: '',
    addressLat: null,
    addressLng: null,
    addressPlaceId: null,
    coveragePolygon: null, // Array<{lat,lng}>
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

    // Generate the default 2km polygon if the user hasn't customized one yet
    setForm((f) =>
      f.coveragePolygon
        ? f
        : {
            ...f,
            coveragePolygon: generateCirclePolygon(
              { lat: f.addressLat, lng: f.addressLng },
              DEFAULT_COVERAGE_RADIUS_M
            ),
          }
    );
    setView('review');
  }

  async function handleConfirm() {
    // Step 2: final submission. (Backend endpoint not built yet — wire it
    // here once /api/institutions/signup exists.)
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        responseNumbers: responseNumbers
          .filter(Boolean)
          .map((n) => (dialCode ? `+${dialCode}${n.replace(/\D/g, '')}` : n)),
        responseEmails: responseEmails.filter(Boolean),
      };
      console.log('Institution signup payload:', payload);
      toast('Account created successfully');
      // TODO: router.push('/signin') once the backend persists the record.
    } catch (err) {
      console.error(err);
      toast('Something went wrong', { variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (view === 'coverage') {
    return (
      <InstitutionCoverageEditor
        center={{ lat: form.addressLat, lng: form.addressLng }}
        polygon={form.coveragePolygon || []}
        onCancel={() => setView('review')}
        onSave={(newPath) => {
          setForm((f) => ({ ...f, coveragePolygon: newPath }));
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
        onConfirm={handleConfirm}
        submitting={submitting}
      />
    );
  }

  return (
    <FormShell
      title="Institution Account"
      onBack={onBack}
      onSubmit={handleSubmit}
    >
      <Field label="Name of institution">
        <input
          type="text"
          value={form.name}
          onChange={update('name')}
          required
          className={inputClass}
        />
      </Field>

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
          Response email(s)
        </label>
        <div className="space-y-2">
          {responseEmails.map((email, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => updateEmail(idx, e.target.value)}
                placeholder="response@example.org"
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
