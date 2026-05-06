'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../lib/api';

const MODES = [
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'foot', label: 'On foot' },
];

export default function DispatchersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [dispatchers, setDispatchers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function fetchAll() {
    if (!user?.email) return;
    setLoading(true);
    try {
      const res = await apiFetch('/dispatchers');
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDispatchers(data.dispatchers || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  async function handleCreate(payload) {
    const res = await apiFetch('/dispatchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || 'Failed to add', { variant: 'error' });
      return;
    }
    setDispatchers((cur) => [...cur, data.dispatcher]);
    setAddOpen(false);
    toast(`${data.dispatcher.name} added`);
  }

  async function handleUpdate(id, payload) {
    const res = await apiFetch(`/dispatchers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || 'Failed to update', { variant: 'error' });
      return;
    }
    setDispatchers((cur) =>
      cur.map((d) => (d.id === id ? data.dispatcher : d))
    );
    setEditing(null);
    toast('Dispatcher updated');
  }

  async function handleDelete(id) {
    const res = await apiFetch(`/dispatchers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast('Failed to delete', { variant: 'error' });
      return;
    }
    setDispatchers((cur) => cur.filter((d) => d.id !== id));
    setDeleting(null);
    toast('Dispatcher removed');
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Dispatchers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading
              ? 'Loading…'
              : dispatchers.length === 0
                ? 'No dispatchers yet — add your first.'
                : `${dispatchers.length} on the team`}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {dispatchers.map((d) => (
          <DispatcherCard
            key={d.id}
            dispatcher={d}
            onEdit={() => setEditing(d)}
            onDelete={() => setDeleting(d)}
          />
        ))}
        <AddCard onClick={() => setAddOpen(true)} />
      </div>

      {addOpen && (
        <DispatcherModal
          title="Add dispatcher"
          onClose={() => setAddOpen(false)}
          onSubmit={handleCreate}
        />
      )}
      {editing && (
        <DispatcherModal
          title="Edit dispatcher"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => handleUpdate(editing.id, payload)}
        />
      )}
      {deleting && (
        <DeleteDispatcherModal
          dispatcher={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => handleDelete(deleting.id)}
        />
      )}
    </div>
  );
}

const MODE_META = {
  vehicle: { label: 'Vehicle' },
  motorcycle: { label: 'Motorcycle' },
  foot: { label: 'On foot' },
};

function AddCard({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-brand hover:text-brand"
    >
      <span className="text-4xl leading-none">+</span>
      <span className="mt-2 text-xs font-semibold uppercase tracking-wider">
        Add dispatcher
      </span>
    </button>
  );
}

function DispatcherCard({ dispatcher, onEdit, onDelete }) {
  const mode = MODE_META[dispatcher.mode] || { label: dispatcher.mode, icon: '•' };
  const initials = (dispatcher.name || '?').slice(0, 2).toUpperCase();

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      {/* Top row: avatar + mode chip */}
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
          {initials}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          {mode.label}
        </span>
      </div>

      {/* Identity */}
      <div className="mt-3">
        <p className="truncate text-sm font-bold text-slate-900">
          {dispatcher.name}
        </p>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
          {dispatcher.dispatcherId}
        </p>
      </div>

      {/* Contact */}
      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <ContactLine
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
          }
          value={dispatcher.emails?.[0]}
          extra={dispatcher.emails?.length > 1 ? dispatcher.emails.length - 1 : 0}
        />
        <ContactLine
          icon={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          }
          value={dispatcher.phones?.[0]}
          extra={dispatcher.phones?.length > 1 ? dispatcher.phones.length - 1 : 0}
        />
      </div>

      {/* Hover actions */}
      <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit"
          title="Edit"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:bg-slate-100 hover:text-brand"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove"
          title="Remove"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:bg-red-50 hover:text-brand"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ContactLine({ icon, value, extra }) {
  if (!value) {
    return (
      <div className="flex items-center gap-2 text-slate-300">
        <span className="flex-shrink-0">{icon}</span>
        <span className="text-[11px] italic">none</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="flex-shrink-0 text-slate-400">{icon}</span>
      <span className="truncate">{value}</span>
      {extra > 0 && (
        <span className="ml-auto flex-shrink-0 rounded bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-500">
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ─────────── Modals ─────────── */

function ModalShell({ children, onClose, maxWidth = 'max-w-lg' }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div
        className={`w-full ${maxWidth} rounded-lg border border-slate-200 bg-white shadow-2xl`}
      >
        {children}
      </div>
    </div>
  );
}

function DispatcherModal({ title, initial, onClose, onSubmit }) {
  const [name, setName] = useState(initial?.name || '');
  const [emails, setEmails] = useState(
    initial?.emails?.length ? initial.emails : ['']
  );
  const [phones, setPhones] = useState(
    initial?.phones?.length ? initial.phones : ['']
  );
  const [mode, setMode] = useState(initial?.mode || 'vehicle');
  const [submitting, setSubmitting] = useState(false);

  function updList(setter) {
    return (i, v) =>
      setter((cur) => cur.map((x, idx) => (idx === i ? v : x)));
  }
  function addList(setter) {
    return () => setter((cur) => [...cur, '']);
  }
  function removeList(setter) {
    return (i) => setter((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        emails: emails.filter(Boolean),
        phones: phones.filter(Boolean),
        mode,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <form onSubmit={submit}>
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {initial?.dispatcherId && (
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-slate-400">
                {initial.dispatcherId}
              </p>
            )}
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

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="e.g. Ambulance 1, Officer Mike"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {!initial && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              ID will be assigned automatically.
            </p>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Email(s)
            </label>
            <DynamicList
              values={emails}
              onUpdate={updList(setEmails)}
              onAdd={addList(setEmails)}
              onRemove={removeList(setEmails)}
              type="email"
              placeholder="dispatcher@example.org"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Phone(s)
            </label>
            <DynamicList
              values={phones}
              onUpdate={updList(setPhones)}
              onAdd={addList(setPhones)}
              onRemove={removeList(setPhones)}
              type="tel"
              placeholder="+254 700 000 000"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Mode of response
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => {
                const isActive = mode === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMode(m.value)}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border-brand bg-brand text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting
              ? 'Saving…'
              : initial
                ? 'Save changes'
                : 'Add dispatcher'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function DynamicList({ values, onUpdate, onAdd, onRemove, type, placeholder }) {
  return (
    <div>
      <div className="space-y-2">
        {values.map((value, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              type={type}
              value={value}
              onChange={(e) => onUpdate(idx, e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="rounded-md border border-slate-300 px-3 text-sm text-slate-500 hover:border-brand hover:text-brand"
                aria-label="Remove"
              >
                −
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
      >
        + Add another
      </button>
    </div>
  );
}

function DeleteDispatcherModal({ dispatcher, onClose, onConfirm }) {
  const REQUIRED = 'delete dispatcher';
  const [text, setText] = useState('');
  const can = text.trim().toLowerCase() === REQUIRED;

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-bold text-slate-900">Remove dispatcher</h3>
        <p className="mt-1 text-xs text-slate-500">
          To remove{' '}
          <span className="font-semibold text-slate-700">{dispatcher.name}</span>
          {' '}({dispatcher.dispatcherId}), type{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-semibold text-slate-700">
            delete dispatcher
          </code>{' '}
          below.
        </p>
      </div>
      <div className="px-5 py-4">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="delete dispatcher"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!can}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          Delete
        </button>
      </div>
    </ModalShell>
  );
}
