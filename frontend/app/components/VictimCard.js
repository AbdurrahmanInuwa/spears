'use client';

import { ageFromDob } from '../lib/auth';
import { getDialCode } from '../lib/countries';

function formatPhone(phone, country) {
  if (!phone) return '—';
  const dial = getDialCode(country);
  if (!dial) return phone;
  const local = String(phone).replace(/\D/g, '').replace(/^0+/, '');
  return `+${dial} ${local}`;
}

export default function VictimCard({ victim }) {
  if (!victim) {
    // Anonymous SOS path — the report came from the public home page
    // without authentication, so we have nothing but type + coordinates.
    return (
      <div className="space-y-1 border-b border-slate-100 px-4 py-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-base font-bold text-slate-500">
          ?
        </div>
        <p className="text-sm font-bold text-slate-700">Anonymous</p>
        <p className="text-[11px] text-slate-500">
          Reported from the public SOS page — no profile attached.
        </p>
      </div>
    );
  }

  const initials =
    `${(victim.firstName || '?')[0] || ''}${(victim.lastName || '')[0] || ''}`.toUpperCase();
  const age = ageFromDob(victim.dob);

  return (
    <div>
      {/* Header: avatar + name + ID */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-slate-900">
            {victim.firstName} {victim.lastName}
            {age != null && (
              <span className="ml-1 text-sm font-normal text-slate-500">
                · {age}
              </span>
            )}
          </p>
          {victim.spaersId && (
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-slate-400">
              ID {victim.spaersId}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <dl className="bg-slate-50 px-4 py-3 text-xs">
        <Row label="Blood" value={victim.bloodGroup} highlight />
        <Row label="Phone" value={formatPhone(victim.phone, victim.country)} />
        <Row label="Allergies" value={victim.allergies} />
        <Row label="Chronic" value={victim.chronicCondition} />
        <Row label="Implant" value={victim.implantDevice ? 'Yes' : 'No'} />
      </dl>
    </div>
  );
}

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-200/60 py-2 last:border-b-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd
        className={`truncate text-right text-sm ${
          highlight && value ? 'font-bold text-brand' : 'text-slate-700'
        }`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
