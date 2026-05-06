'use client';

import { useEffect, useState } from 'react';
import {
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from '@react-google-maps/api';
import { googleMapsLoaderOptions } from '../../lib/googleMaps';
import { useInstitution } from '../InstitutionContext';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../lib/api';
import InstitutionCoverageEditor from '../../signup/InstitutionCoverageEditor';
import { getDialCode } from '../../lib/countries';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import TwoFactorToggleModal from '../../components/TwoFactorToggleModal';

const containerStyle = { width: '100%', height: '100%' };

export default function InstitutionSettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { institution, loading, refresh } = useInstitution();
  const { isLoaded, loadError } = useJsApiLoader(googleMapsLoaderOptions);
  const [editing, setEditing] = useState(false);
  const [editingContacts, setEditingContacts] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [numbers, setNumbers] = useState([]);
  const [emails, setEmails] = useState([]);
  const [savingContacts, setSavingContacts] = useState(false);

  // Reset local edit buffers whenever the institution data refreshes
  useEffect(() => {
    if (institution) {
      setNumbers(
        institution.responseNumbers?.length ? institution.responseNumbers : ['']
      );
      setEmails(
        institution.responseEmails?.length ? institution.responseEmails : ['']
      );
    }
  }, [institution]);

  const dialCode = institution ? getDialCode(institution.country) : null;

  function startContactsEdit() {
    setNumbers(
      institution.responseNumbers?.length
        ? institution.responseNumbers.map((n) =>
            // strip the country code so the user only edits the local part
            dialCode && n.startsWith(`+${dialCode}`)
              ? n.slice(dialCode.length + 1)
              : n
          )
        : ['']
    );
    setEmails(
      institution.responseEmails?.length ? institution.responseEmails : ['']
    );
    setEditingContacts(true);
  }

  function cancelContactsEdit() {
    setEditingContacts(false);
  }

  async function saveContacts() {
    setSavingContacts(true);
    try {
      const cleanedNumbers = numbers
        .filter((n) => n && n.trim())
        .map((n) =>
          dialCode ? `+${dialCode}${n.replace(/\D/g, '')}` : n.trim()
        );
      const cleanedEmails = emails.map((e) => e.trim()).filter(Boolean);
      if (cleanedEmails.length === 0) {
        toast('Add at least one response email', { variant: 'error' });
        return;
      }
      const res = await apiFetch('/institutions/me',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            responseNumbers: cleanedNumbers,
            responseEmails: cleanedEmails,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Failed to save contacts', { variant: 'error' });
        return;
      }
      toast('Contacts updated');
      setEditingContacts(false);
      refresh();
    } finally {
      setSavingContacts(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (!institution) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Could not load institution.
      </div>
    );
  }

  const center = { lat: institution.centerLat, lng: institution.centerLng };
  const polygon = institution.coveragePolygon || [];

  async function handleCoverageSave({ center: newCenter, polygon: newPolygon, reason }) {
    try {
      const res = await apiFetch('/institutions/me',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            centerLat: newCenter.lat,
            centerLng: newCenter.lng,
            coveragePolygon: newPolygon,
            coverageReason: reason || institution.coverageReason || '',
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Failed to save coverage', { variant: 'error' });
        return;
      }
      toast('Coverage updated');
      setEditing(false);
      refresh();
    } catch (e) {
      console.error(e);
      toast('Network error', { variant: 'error' });
    }
  }

  if (editing) {
    return (
      <InstitutionCoverageEditor
        center={center}
        polygon={polygon}
        institution={{
          name: institution.name,
          type: institution.type,
          country: institution.country,
          address: institution.address,
        }}
        onCancel={() => setEditing(false)}
        onSave={handleCoverageSave}
      />
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Institution profile and coverage area.
      </p>

      <div className="mt-6 mb-5 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-slate-500" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
            Security
          </h2>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Password
              </p>
              <p className="text-sm text-slate-700">••••••••</p>
            </div>
            <button
              type="button"
              onClick={() => setShowChangePassword(true)}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark"
            >
              Change
            </button>
          </div>
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Two-factor auth
              </p>
              <p
                className={`text-sm font-medium ${
                  institution.twoFactorEnabled
                    ? 'text-emerald-600'
                    : 'text-slate-500'
                }`}
              >
                {institution.twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTwoFactor(true)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand hover:text-brand"
            >
              {institution.twoFactorEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        {/* Left: institution info */}
        <section className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                Institution
              </h2>
            </div>
            {editingContacts ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelContactsEdit}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveContacts}
                  disabled={savingContacts}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {savingContacts ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startContactsEdit}
                className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark"
              >
                Edit contacts
              </button>
            )}
          </header>
          <div className="grid flex-1 grid-cols-1 gap-px bg-slate-100">
            <Tile label="Name" value={institution.name} />
            <Tile label="Type" value={institution.type} />
            <Tile label="Year established" value={institution.yearEstablished || '—'} />
            <Tile label="Country" value={institution.country} />
            <Tile label="Address" value={institution.address} />

            {/* Response numbers — editable */}
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Response numbers
              </p>
              {editingContacts ? (
                <DynamicList
                  values={numbers}
                  onChange={setNumbers}
                  type="tel"
                  prefix={dialCode ? `+${dialCode}` : null}
                  placeholder={dialCode ? '700 000 000' : ''}
                />
              ) : (
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {(institution.responseNumbers || []).join(', ') || '—'}
                </p>
              )}
            </div>

            {/* Response emails — editable */}
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Response emails
              </p>
              {editingContacts ? (
                <DynamicList
                  values={emails}
                  onChange={setEmails}
                  type="email"
                  placeholder="dispatch@example.org"
                />
              ) : (
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {(institution.responseEmails || []).join(', ') || '—'}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Right: coverage map + Edit */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                Coverage
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-dark"
            >
              Edit
            </button>
          </header>
          <div>
            <div className="h-[360px] w-full">
              {!isLoaded ? (
                <div className="flex h-full w-full items-center justify-center bg-slate-50 text-sm text-slate-500">
                  {loadError ? 'Failed to load map.' : 'Loading map…'}
                </div>
              ) : (
                <GoogleMap
                  mapContainerStyle={containerStyle}
                  center={center}
                  zoom={13}
                  options={{
                    mapTypeId: 'satellite',
                    disableDefaultUI: true,
                    zoomControl: true,
                    clickableIcons: false,
                  }}
                >
                  <Marker position={center} />
                  {polygon.length > 0 && (
                    <Polygon
                      paths={polygon}
                      options={{
                        fillColor: '#dc2626',
                        fillOpacity: 0.18,
                        strokeColor: '#dc2626',
                        strokeOpacity: 0.9,
                        strokeWeight: 2,
                        clickable: false,
                      }}
                    />
                  )}
                </GoogleMap>
              )}
            </div>
          </div>
        </section>
      </div>

      {showChangePassword && (
        <ChangePasswordModal
          role="institution"
          email={user.email}
          onClose={() => setShowChangePassword(false)}
        />
      )}
      {showTwoFactor && (
        <TwoFactorToggleModal
          currentlyEnabled={!!institution.twoFactorEnabled}
          onClose={() => setShowTwoFactor(false)}
          onChanged={() => refresh()}
        />
      )}
    </div>
  );
}

function DynamicList({ values, onChange, type, prefix, placeholder }) {
  function update(idx, v) {
    onChange(values.map((x, i) => (i === idx ? v : x)));
  }
  function add() {
    onChange([...values, '']);
  }
  function remove(idx) {
    onChange(values.filter((_, i) => i !== idx));
  }
  return (
    <div className="mt-2 space-y-2">
      {values.map((value, idx) => (
        <div key={idx} className="flex gap-2">
          <div className="flex flex-1 items-stretch overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
            {prefix && (
              <span className="flex items-center border-r border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
                {prefix}
              </span>
            )}
            <input
              type={type}
              value={value}
              onChange={(e) => update(idx, e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent px-2 py-1.5 text-sm text-slate-900 outline-none"
            />
          </div>
          {values.length > 1 && (
            <button
              type="button"
              onClick={() => remove(idx)}
              className="rounded-md border border-slate-300 px-2 text-sm text-slate-500 hover:border-brand hover:text-brand"
              aria-label="Remove"
            >
              −
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
      >
        + Add another
      </button>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
