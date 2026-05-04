'use client';

import { useEffect } from 'react';

const items = [
  { name: 'Hospital', distance: '2.2 km' },
  { name: 'Police Station', distance: '3.1 km' },
  { name: 'Fire Service', distance: '4.4 km' },
  { name: 'Pharmacy', distance: '0.8 km' },
  { name: 'Ambulance Hub', distance: '1.5 km' },
];

export default function NearbyHelpModal({ open, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30">
      {/* anchored panel — positioned over the card itself, not screen-centered */}
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
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.name}
              className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-700">{item.name}</span>
              <span className="text-xs text-slate-500">{item.distance}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
