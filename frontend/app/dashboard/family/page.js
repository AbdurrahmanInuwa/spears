'use client';

import { useEffect, useState } from 'react';
import { useAuth, ageFromDob } from '../../lib/auth';
import { useToast } from '../../components/Toast';
import { apiFetch } from '../../lib/api';
import { getDialCode } from '../../lib/countries';

function formatPhone(phone, country) {
  if (!phone) return '—';
  const dial = getDialCode(country);
  if (!dial) return phone;
  const local = String(phone).replace(/\D/g, '').replace(/^0+/, '');
  return `+${dial} ${local}`;
}

export default function FamilyPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [ackAt, setAckAt] = useState(null);
  const [family, setFamily] = useState(null); // { id, creatorId } | null
  const [members, setMembers] = useState([]);
  const [callConfigOpen, setCallConfigOpen] = useState(false);

  // ack form state
  const [ack1, setAck1] = useState(false);
  const [ack2, setAck2] = useState(false);
  const [ackSubmitting, setAckSubmitting] = useState(false);

  // modal state
  const [addOpen, setAddOpen] = useState(false);
  const [viewMember, setViewMember] = useState(null);
  const [deleteMember, setDeleteMember] = useState(null);

  async function refresh() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await apiFetch('/family/me');
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAckAt(data.ackAt || null);
        setFamily(data.family || null);
        setMembers(data.members || []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function persistAck() {
    setAckSubmitting(true);
    try {
      const res = await apiFetch('/family/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Could not save acknowledgment', {
          variant: 'error',
        });
        return;
      }
      setAckAt(data.familyAckAt || new Date().toISOString());
      await refresh();
    } finally {
      setAckSubmitting(false);
    }
  }

  if (!user) return null;
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  // Ack gate
  if (!ackAt) {
    const canContinue = ack1 && ack2;
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Family</h1>
        <p className="mt-2 text-sm text-slate-500">
          Please review and acknowledge before continuing.
        </p>

        <div className="mt-6 max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={ack1}
              onChange={(e) => setAck1(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-sm text-slate-700">
              You and all other members above 18 will be notified of any
              emergency triggered by another member of the family.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <input
              type="checkbox"
              checked={ack2}
              onChange={(e) => setAck2(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span className="text-sm text-slate-700">
              By ticking this box, I confirm that the bio information of the
              person(s) under the age of 18, under my care may be shared with
              responding authority and law enforcement agency in the event of
              an emergency through SPAERS.
            </span>
          </label>

          <button
            type="button"
            onClick={persistAck}
            disabled={!canContinue || ackSubmitting}
            className="mt-2 w-full rounded-md bg-brand px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ackSubmitting ? 'Saving…' : 'I acknowledge'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Family</h1>
          <p className="mt-1 text-sm text-slate-500">
            {members.length === 0
              ? 'Add your first family member.'
              : `${members.length} member${members.length === 1 ? '' : 's'} in your family.`}
          </p>
        </div>
        {family?.creatorId === user.id && members.length > 1 && (
          <button
            type="button"
            onClick={() => setCallConfigOpen(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 shadow-sm transition hover:border-brand hover:text-brand"
          >
            Configure call alerts
          </button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* User's own card always first */}
        {(() => {
          const selfInList = members.find((m) => m.id === user.id);
          const self = selfInList || user;
          return (
            <MemberCard
              member={self}
              isSelf
              onView={() => setViewMember(self)}
            />
          );
        })()}

        {/* Other family members */}
        {members
          .filter((m) => m.id !== user.id)
          .map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              onView={() => setViewMember(m)}
              onDelete={() => setDeleteMember(m)}
            />
          ))}

        {/* Add card last */}
        <AddCard onClick={() => setAddOpen(true)} />
      </div>

      {addOpen && (
        <AddMemberModal
          currentCitizenId={user.id}
          onClose={() => setAddOpen(false)}
          onAdded={(updated) => {
            setMembers(updated);
            setAddOpen(false);
            toast('Family member added');
          }}
        />
      )}

      {viewMember && (
        <MemberDetailsModal
          member={viewMember}
          onClose={() => setViewMember(null)}
        />
      )}

      {deleteMember && (
        <DeleteMemberModal
          member={deleteMember}
          currentCitizenId={user.id}
          onClose={() => setDeleteMember(null)}
          onRemoved={(updated) => {
            setMembers(updated);
            setDeleteMember(null);
            toast(`${deleteMember.firstName} ${deleteMember.lastName} removed`);
          }}
        />
      )}

      {callConfigOpen && (
        <CallConfigModal
          members={members.filter((m) => m.id !== user.id)}
          onClose={() => setCallConfigOpen(false)}
          onSaved={(updated) => {
            setMembers(updated);
            setCallConfigOpen(false);
            toast('Call alerts updated');
          }}
        />
      )}
    </div>
  );
}

/* ─────────── Cards ─────────── */

function AddCard({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[4/5] flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-400 transition hover:border-brand hover:text-brand"
      aria-label="Add family member"
    >
      <span className="text-5xl leading-none">+</span>
      <span className="mt-2 text-xs font-semibold uppercase tracking-wider">
        Add member
      </span>
    </button>
  );
}

function MemberCard({ member, isSelf, onView, onDelete }) {
  const age = ageFromDob(member.dob);
  return (
    <div className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        type="button"
        onClick={onView}
        className="flex h-full w-full flex-col items-center justify-center px-4 text-center"
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/10 text-2xl font-bold text-brand">
          {(member.firstName || '?').slice(0, 1).toUpperCase()}
          {(member.lastName || '').slice(0, 1).toUpperCase()}
        </div>
        <p className="mt-3 text-base font-bold text-slate-900">
          {member.firstName} {member.lastName}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {isSelf ? 'You' : age != null ? `${age} yrs` : ''}
          {member.bloodGroup ? ` · ${member.bloodGroup}` : ''}
        </p>
        {isSelf && (
          <span className="mt-3 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            You
          </span>
        )}
      </button>

      {!isSelf && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-full bg-white text-slate-400 shadow ring-1 ring-slate-200 hover:bg-red-50 hover:text-brand group-hover:flex"
          aria-label="Remove member"
          title="Remove member"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ─────────── Modals ─────────── */

function CallConfigModal({ members, onClose, onSaved }) {
  const [selected, setSelected] = useState(
    () => new Set(members.filter((m) => m.familyCallEligible).map((m) => m.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const max = 2;
  const count = selected.size;

  function toggle(id) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else if (next.size < max) next.add(id);
      return next;
    });
  }

  async function save() {
    setSubmitting(true);
    try {
      const res = await apiFetch('/family/me/call-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return;
      }
      onSaved(data.members || []);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-md">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Call alerts
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Pick up to {max} family members to receive a phone call (in
              addition to SMS + email) when anyone in the family triggers an
              SOS.
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
      </div>

      <div className="px-5 py-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {count} / {max} selected
        </p>
        {members.length === 0 ? (
          <p className="rounded-md bg-slate-50 px-3 py-3 text-xs italic text-slate-500">
            No other family members yet. Add one first.
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => {
              const checked = selected.has(m.id);
              const disabled = !checked && count >= max;
              return (
                <li key={m.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition ${
                      checked
                        ? 'border-brand bg-red-50'
                        : disabled
                          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(m.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {m.firstName} {m.lastName}
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-400">
                        {m.spaersId}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
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
          onClick={save}
          disabled={submitting}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onClose, maxWidth = 'max-w-md' }) {
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

function AddMemberModal({ currentCitizenId, onClose, onAdded }) {
  const [spaersId, setSpaersId] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    setError(null);
    const id = spaersId.trim();
    if (!id) {
      setError('Enter a SPAERS ID');
      return;
    }
    if (!/^\d{10}$/.test(id)) {
      setError('SPAERS ID must be 10 digits');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/family/me/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spaersId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not add member');
        return;
      }
      onAdded(data.members || []);
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-bold text-slate-900">
          Add Family Member
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Enter the SPAERS ID of the person you want to add.
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <input
          type="text"
          value={spaersId}
          onChange={(e) => {
            setSpaersId(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. 4272028775"
          inputMode="numeric"
          autoFocus
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm tracking-wider text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
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
          onClick={handleAdd}
          disabled={loading}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Adding…' : 'Add'}
        </button>
      </div>
    </ModalShell>
  );
}

function DeleteMemberModal({ member, currentCitizenId, onClose, onRemoved }) {
  const REQUIRED = 'Delete member.';
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const canDelete = text === REQUIRED;

  async function handleDelete() {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/family/me/members/${member.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      onRemoved(data.members || []);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-bold text-slate-900">Remove member</h3>
        <p className="mt-1 text-xs text-slate-500">
          To remove{' '}
          <span className="font-semibold text-slate-700">
            {member.firstName} {member.lastName}
          </span>{' '}
          from your family, type{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px] font-semibold text-slate-700">
            {REQUIRED}
          </code>{' '}
          below.
        </p>
      </div>
      <div className="px-5 py-4">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={REQUIRED}
          autoFocus
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
          onClick={handleDelete}
          disabled={!canDelete || submitting}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          {submitting ? 'Removing…' : 'Delete'}
        </button>
      </div>
    </ModalShell>
  );
}

function MemberDetailsModal({ member, onClose }) {
  const age = ageFromDob(member.dob);
  const initials =
    `${(member.firstName || '?')[0] || ''}${(member.lastName || '')[0] || ''}`.toUpperCase();

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-3xl">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ✕
        </button>

        <div className="px-6 pb-6 pt-6">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
            <div className="relative flex h-32 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-brand text-3xl font-extrabold text-white shadow-lg ring-1 ring-slate-200">
              <span>{initials}</span>
            </div>
            <div className="mt-4 flex-1 sm:mt-0">
              <h2 className="text-2xl font-extrabold text-slate-900">
                {member.firstName} {member.lastName}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {member.email || '—'}
              </p>
              {member.spaersId && (
                <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/5 px-3 py-1 text-xs font-bold tracking-wider text-brand">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-70">
                    ID
                  </span>
                  <span className="font-mono">{member.spaersId}</span>
                </span>
              )}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2">
            <DetailsSection title="Personal" accent="bg-brand">
              <DetailsTile
                label="Name"
                value={`${member.firstName} ${member.lastName}`}
              />
              <DetailsTile label="Email" value={member.email || '—'} />
              <DetailsTile
                label="Phone"
                value={formatPhone(member.phone, member.country)}
              />
              <DetailsTile label="Age" value={age != null ? `${age}` : '—'} />
            </DetailsSection>

            <DetailsSection title="Medical" accent="bg-emerald-500">
              <DetailsTile
                label="Blood group"
                value={member.bloodGroup || '—'}
                highlight={!!member.bloodGroup}
              />
              <DetailsTile label="Allergies" value={member.allergies || '—'} />
              <DetailsTile
                label="Chronic condition"
                value={member.chronicCondition || '—'}
              />
              <DetailsTile
                label="Implanted device"
                value={member.implantDevice ? 'Yes' : 'No'}
              />
            </DetailsSection>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function DetailsSection({ title, accent, children }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
          {title}
        </h3>
      </header>
      <div className="grid flex-1 grid-cols-1 gap-px bg-slate-100">
        {children}
      </div>
    </section>
  );
}

function DetailsTile({ label, value, highlight }) {
  return (
    <div className="bg-white px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-medium ${
          highlight ? 'text-brand' : 'text-slate-800'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
