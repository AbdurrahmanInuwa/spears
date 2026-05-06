'use client';

import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { API_URL } from '../../../../../../../lib/api';
import MobileDrawer from '../../../../../../components/MobileDrawer';
import MobileTopBar from '../../../../../../components/MobileTopBar';

const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH;
const TOKEN_KEY = 'spaers_admin_token_v1';

const TABS = [
  { id: 'volunteers', label: 'Volunteers' },
  { id: 'institutions', label: 'Institutions' },
  { id: 'citizens', label: 'Citizens' },
];

export default function AdminConsolePage() {
  const router = useRouter();
  const { secretPath } = useParams();
  const [token, setToken] = useState(null);
  const [tab, setTab] = useState('volunteers');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!ADMIN_PATH || secretPath !== ADMIN_PATH) {
      notFound();
    }
  }, [secretPath]);

  useEffect(() => {
    const t = window.localStorage.getItem(TOKEN_KEY);
    if (!t) {
      router.replace(`/d/f/g/h/admin/${secretPath}`);
      return;
    }
    (async () => {
      const res = await fetch(`${API_URL}/admin/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        window.localStorage.removeItem(TOKEN_KEY);
        router.replace(`/d/f/g/h/admin/${secretPath}`);
        return;
      }
      setToken(t);
    })();
  }, [router, secretPath]);

  async function logout() {
    if (!token) return;
    try {
      await fetch(`${API_URL}/admin/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    window.localStorage.removeItem(TOKEN_KEY);
    router.replace(`/d/f/g/h/admin/${secretPath}`);
  }

  if (!token) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  const sidebarContent = (
    <aside className="flex h-full w-full flex-col bg-white">
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-xl font-extrabold tracking-tight text-brand">SPAERS</p>
        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
          Admin
        </p>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setDrawerOpen(false);
              }}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                isActive
                  ? 'bg-brand text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={logout}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand"
        >
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-slate-50">
      <div className="hidden h-full w-60 flex-shrink-0 border-r border-slate-200 md:flex">
        {sidebarContent}
      </div>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {sidebarContent}
      </MobileDrawer>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <MobileTopBar
          onMenu={() => setDrawerOpen(true)}
          title="SPAERS · Admin"
        />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
          {tab === 'volunteers' && <VolunteersTab token={token} />}
          {tab === 'institutions' && <InstitutionsTab token={token} />}
          {tab === 'citizens' && <CitizensTab token={token} />}
        </main>
      </div>
    </div>
  );
}

function authFetch(token, path, opts = {}) {
  return fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

/* ─────────── Volunteers ─────────── */

function VolunteersTab({ token }) {
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const url =
      filter === 'all'
        ? '/admin/volunteers'
        : `/admin/volunteers?status=${filter}`;
    const res = await authFetch(token, url);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setItems(data.volunteers || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function decide(volunteer, action) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await authFetch(
        token,
        `/admin/volunteers/${volunteer.id}/${action}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems((cur) =>
          cur.map((v) => (v.id === volunteer.id ? data.volunteer : v))
        );
        setActive(data.volunteer);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Volunteers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Approve, reject, or revoke volunteer applications.
          </p>
        </div>
        <FilterTabs
          options={[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved' },
            { id: 'revoked', label: 'Revoked' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">
            No applications.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
              >
                <button
                  type="button"
                  onClick={() => setActive(v)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-bold text-slate-900">
                    {v.citizen?.firstName} {v.citizen?.lastName}
                    <span className="ml-2 font-mono text-[10px] text-slate-400">
                      {v.citizen?.spaersId}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {v.field} · {v.citizen?.email}
                  </p>
                </button>
                <StatusPill status={v.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <DetailsModal title="Volunteer" onClose={() => setActive(null)}>
          <Row label="Name" value={`${active.citizen?.firstName} ${active.citizen?.lastName}`} />
          <Row label="ID" value={active.citizen?.spaersId} mono />
          <Row label="Email" value={active.citizen?.email} />
          <Row label="Phone" value={active.citizen?.phone} />
          <Row label="Field" value={active.field} />
          <Row
            label="ID file"
            value={
              active.idFileName || (active.idFileKey ? 'Uploaded' : '—')
            }
          />
          {active.idFileKey && (
            <div className="border-b border-slate-100 py-2 last:border-b-0">
              <button
                type="button"
                onClick={async () => {
                  const res = await authFetch(
                    token,
                    `/admin/volunteers/${active.id}/id-file-url`
                  );
                  const data = await res.json().catch(() => ({}));
                  if (res.ok && data.url) {
                    window.open(data.url, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="rounded-md border border-brand bg-white px-3 py-1.5 text-xs font-bold text-brand transition hover:bg-brand hover:text-white"
              >
                View ID file
              </button>
            </div>
          )}
          <Row label="Status" value={active.status} />
          {active.decisionNote && (
            <Row label="Decision note" value={active.decisionNote} />
          )}
          {active.decidedAt && (
            <Row
              label="Decided at"
              value={new Date(active.decidedAt).toLocaleString()}
            />
          )}
          <Row
            label="Applied at"
            value={new Date(active.createdAt).toLocaleString()}
          />

          <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
            {active.status !== 'approved' && (
              <button
                type="button"
                onClick={() => decide(active, 'approve')}
                disabled={busy}
                className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Approve
              </button>
            )}
            {active.status === 'approved' && (
              <button
                type="button"
                onClick={() => decide(active, 'revoke')}
                disabled={busy}
                className="flex-1 rounded-md bg-brand px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                Revoke
              </button>
            )}
            {active.status === 'pending' && (
              <button
                type="button"
                onClick={() => decide(active, 'revoke')}
                disabled={busy}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject
              </button>
            )}
          </div>
        </DetailsModal>
      )}
    </div>
  );
}

/* ─────────── Institutions ─────────── */

function InstitutionsTab({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await authFetch(token, '/admin/institutions');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems(data.institutions || []);
      setLoading(false);
    })();
  }, [token]);

  async function openDetails(id) {
    const res = await authFetch(token, `/admin/institutions/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setActive(data.institution);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Institutions</h1>
      <p className="mt-1 text-sm text-slate-500">
        {loading ? 'Loading…' : `${items.length} registered`}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {!loading && items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">
            No institutions.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => openDetails(i.id)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{i.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {i.type} · {i.country} · {i.email}
                    </p>
                  </div>
                  {!i.emailVerifiedAt && (
                    <StatusPill status="unverified" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <InstitutionDetailsModal
          institution={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

/* ─────────── Citizens ─────────── */

function CitizensTab({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await authFetch(token, '/admin/citizens');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setItems(data.citizens || []);
      setLoading(false);
    })();
  }, [token]);

  async function openDetails(id) {
    const res = await authFetch(token, `/admin/citizens/${id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setActive(data.citizen);
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">Citizens</h1>
      <p className="mt-1 text-sm text-slate-500">
        {loading ? 'Loading…' : `${items.length} registered`}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {!loading && items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">
            No citizens.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openDetails(c.id)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {c.firstName} {c.lastName}
                      <span className="ml-2 font-mono text-[10px] text-slate-400">
                        {c.spaersId}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {c.email}
                    </p>
                  </div>
                  {!c.emailVerifiedAt && (
                    <StatusPill status="unverified" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active && (
        <CitizenDetailsModal
          citizen={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

/* ─────────── Citizen details modal (custom layout) ─────────── */

function CitizenDetailsModal({ citizen, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const initials =
    `${(citizen.firstName || '?')[0] || ''}${(citizen.lastName || '')[0] || ''}`.toUpperCase();
  const age = (() => {
    if (!citizen.dob) return null;
    const d = new Date(citizen.dob);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-start gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-base font-bold text-white shadow-sm">
            {citizen.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={citizen.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials || '?'
            )}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-lg font-extrabold text-slate-900">
              {citizen.firstName} {citizen.lastName}
              {age != null && (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  · {age}
                </span>
              )}
            </p>
            {citizen.spaersId && (
              <span className="mt-1 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/5 px-3 py-0.5 text-[11px] font-bold tracking-wider text-brand">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] opacity-70">
                  ID
                </span>
                <span className="font-mono">{citizen.spaersId}</span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <Section title="Profile" accent="bg-brand">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldTile label="Email" value={citizen.email} />
              <FieldTile
                label="Phone"
                value={citizen.phone}
                mono
              />
              <FieldTile label="Country" value={citizen.country || '—'} />
              <FieldTile
                label="Date of birth"
                value={
                  citizen.dob
                    ? new Date(citizen.dob).toLocaleDateString()
                    : '—'
                }
              />
            </div>
          </Section>

          <Section title="Medical" accent="bg-emerald-500">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldTile
                label="Blood group"
                value={citizen.bloodGroup || '—'}
                highlight={!!citizen.bloodGroup}
              />
              <FieldTile
                label="Implant"
                value={citizen.implantDevice ? 'Yes' : 'No'}
              />
              <FieldTile
                label="Allergies"
                value={citizen.allergies || '—'}
              />
              <FieldTile
                label="Chronic condition"
                value={citizen.chronicCondition || '—'}
              />
            </div>
          </Section>

          {citizen.family && (
            <Section title="Family" accent="bg-violet-500">
              <p className="text-xs text-slate-500">
                {citizen.family.members?.length || 0} member
                {citizen.family.members?.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {(citizen.family.members || []).map((m) => (
                  <li key={m.id}>
                    {m.firstName} {m.lastName}{' '}
                    <span className="font-mono text-[10px] text-slate-400">
                      {m.spaersId}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {citizen.volunteer && (
            <Section title="Volunteer" accent="bg-amber-500">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FieldTile label="Field" value={citizen.volunteer.field} />
                <FieldTile label="Status" value={citizen.volunteer.status} />
              </div>
            </Section>
          )}

          <Section title="Audit" accent="bg-slate-400">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldTile
                label="Email verified"
                value={
                  citizen.emailVerifiedAt
                    ? new Date(citizen.emailVerifiedAt).toLocaleString()
                    : 'Not verified'
                }
                warn={!citizen.emailVerifiedAt}
              />
              <FieldTile
                label="Created"
                value={new Date(citizen.createdAt).toLocaleString()}
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Institution details modal (custom layout) ─────────── */

function InstitutionDetailsModal({ institution, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const initials = (institution.name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
  const numbers = institution.responseNumbers || [];
  const emails = institution.responseEmails || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-start gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-brand text-base font-bold text-white shadow-sm">
            {initials || '?'}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-lg font-extrabold text-slate-900">
              {institution.name}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold uppercase tracking-wider text-slate-600">
                {institution.type}
              </span>
              <span>{institution.country}</span>
              {institution.yearEstablished && (
                <span>· est. {institution.yearEstablished}</span>
              )}
            </p>
            {institution.dispatcherCount != null && (
              <p className="mt-2 text-[11px] text-slate-500">
                <span className="font-bold text-slate-800">
                  {institution.dispatcherCount}
                </span>{' '}
                {institution.dispatcherCount === 1
                  ? 'dispatcher'
                  : 'dispatchers'}{' '}
                · Login:{' '}
                <span className="font-mono text-slate-700">
                  {institution.email}
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          {/* Address */}
          <Section title="Address" accent="bg-brand">
            <p className="text-sm leading-relaxed text-slate-700">
              {institution.address}
            </p>
          </Section>

          {/* Contact */}
          <Section title="Contact" accent="bg-sky-500">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ContactList label="Phone" items={numbers} mono />
              <ContactList label="Email" items={emails} />
            </div>
          </Section>

          {/* Coverage */}
          <Section title="Coverage" accent="bg-emerald-500">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldTile
                label="Center"
                value={
                  institution.centerLat != null && institution.centerLng != null
                    ? `${institution.centerLat.toFixed(5)}, ${institution.centerLng.toFixed(5)}`
                    : '—'
                }
                mono
              />
              <FieldTile
                label="Coverage reason"
                value={institution.coverageReason || '—'}
              />
            </div>
          </Section>

          {/* Dispatchers */}
          {institution.dispatchers && institution.dispatchers.length > 0 && (
            <Section title="Dispatchers" accent="bg-amber-500">
              <ul className="space-y-2">
                {institution.dispatchers.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">
                        {d.name}
                      </p>
                      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
                        {d.dispatcherId}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] capitalize text-slate-500">
                      {d.mode}
                      {d.emails?.[0] ? ` · ${d.emails[0]}` : ''}
                      {d.phones?.[0] ? ` · ${d.phones[0]}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Audit */}
          <Section title="Audit" accent="bg-slate-400">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldTile
                label="Email verified"
                value={
                  institution.emailVerifiedAt
                    ? new Date(institution.emailVerifiedAt).toLocaleString()
                    : 'Not verified'
                }
                warn={!institution.emailVerifiedAt}
              />
              <FieldTile
                label="Created"
                value={new Date(institution.createdAt).toLocaleString()}
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, accent, children }) {
  return (
    <section>
      <header className="mb-2 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />
        <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </h4>
      </header>
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        {children}
      </div>
    </section>
  );
}

function FieldTile({ label, value, mono, highlight, warn }) {
  // `highlight` = positive emphasis (brand red, e.g. blood group)
  // `warn` = negative emphasis (amber, e.g. unverified)
  let tone = 'text-slate-800';
  if (warn) tone = 'font-semibold text-amber-700';
  else if (highlight) tone = 'font-bold text-brand';
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm ${tone} ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ContactList({ label, items, mono }) {
  if (!items || items.length === 0) {
    return <FieldTile label={label} value="—" />;
  }
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <ul className="mt-1 space-y-1">
        {items.map((it) => (
          <li
            key={it}
            className={`truncate text-sm text-slate-800 ${
              mono ? 'font-mono text-[12px]' : ''
            }`}
          >
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────── shared bits ─────────── */

function FilterTabs({ options, value, onChange }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-200 bg-white text-xs shadow-sm">
      {options.map((o) => {
        const isActive = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-3 py-1.5 font-semibold transition ${
              isActive
                ? 'bg-brand text-white'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    revoked: 'border-red-200 bg-red-50 text-red-700',
    unverified: 'border-slate-200 bg-slate-100 text-slate-500',
  };
  const cls = map[status] || 'border-slate-200 bg-slate-100 text-slate-600';
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

function DetailsModal({ title, onClose, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={`text-right text-sm text-slate-800 ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}
