'use client';

import { useEffect } from 'react';

export default function NearbyHelpModal({ open, onClose, summary }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const list = summary?.list || [];

  return (
    <div className="absolute inset-0 z-30">
      <div className="absolute right-0 top-0 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">
            Nearby Services
          </h4>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!summary ? (
          <p className="text-xs text-slate-500">Checking your area…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-slate-500">
            No registered responders within 15&nbsp;km.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {list.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700">
                    {item.name}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    {item.type}
                  </p>
                </div>
                <span className="ml-2 text-xs text-slate-500">
                  {item.distanceM < 1000
                    ? `${Math.round(item.distanceM)} m`
                    : `${(item.distanceM / 1000).toFixed(1)} km`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
