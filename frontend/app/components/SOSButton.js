'use client';

import { useState, useRef, useEffect } from 'react';

const emergencies = [
  { label: 'Shooting' },
  { label: 'Medical' },
  { label: 'Assault' },
  { label: 'Fire' },
  { label: 'Flooding' },
];

export default function SOSButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-md bg-brand px-6 py-3 text-base font-bold tracking-wide text-white shadow-md transition hover:bg-brand-dark"
      >
        SOS
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 z-30 mb-3 flex -translate-x-1/2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_-10px_rgba(220,38,38,0.35),0_8px_20px_-6px_rgba(0,0,0,0.15)] ring-1 ring-black/5">
          {emergencies.map((e) => (
            <button
              key={e.label}
              onClick={() => {
                setOpen(false);
                // hook into backend later
                console.log('Trigger SOS:', e.label);
              }}
              className="rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-red-50 hover:text-brand"
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
