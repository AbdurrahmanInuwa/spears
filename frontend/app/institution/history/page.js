'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

export default function HistoryPage() {
  const { user } = useAuth();
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch('/emergencies/history');
        const data = await res.json().catch(() => ({}));
        if (res.ok) setEmergencies(data.emergencies || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.email]);

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-slate-900">History</h1>
      <p className="mt-1 text-sm text-slate-500">
        Past emergencies in your coverage area.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">
            Loading…
          </div>
        ) : emergencies.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            No emergencies yet.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {emergencies.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setDetails(e)}
                  className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        e.status === 'resolved'
                          ? 'bg-emerald-500'
                          : e.status === 'dispatched'
                            ? 'bg-amber-500'
                            : 'bg-brand'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-900">{e.type}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(e.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {e.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {details && (
        <DetailsModal item={details} onClose={() => setDetails(null)} />
      )}
    </div>
  );
}

function DetailsModal({ item, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dispatch = item.dispatches?.[0];
  const responseSec = dispatch?.startedAt
    ? Math.round(
        (new Date(dispatch.startedAt).getTime() -
          new Date(item.createdAt).getTime()) /
          1000
      )
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{item.type}</h3>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-400">
              {item.status} · {new Date(item.createdAt).toLocaleString()}
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
        <div className="grid grid-cols-1 gap-px bg-slate-100">
          <Tile label="Victim location" value={`${item.victimLat.toFixed(5)}, ${item.victimLng.toFixed(5)}`} />
          <Tile label="Created" value={new Date(item.createdAt).toLocaleString()} />
          {item.resolvedAt && (
            <Tile label="Resolved" value={new Date(item.resolvedAt).toLocaleString()} />
          )}
          {dispatch && (
            <>
              <Tile label="Dispatcher" value={dispatch.dispatcher?.name || '—'} />
              <Tile label="Dispatcher ID" value={dispatch.dispatcher?.dispatcherId || '—'} />
              <Tile label="Mode" value={dispatch.dispatcher?.mode || '—'} />
              {dispatch.startedAt && (
                <Tile
                  label="Started"
                  value={new Date(dispatch.startedAt).toLocaleString()}
                />
              )}
              {responseSec != null && (
                <Tile
                  label="Response time"
                  value={`${responseSec}s`}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="bg-white px-5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-800">{value}</p>
    </div>
  );
}
