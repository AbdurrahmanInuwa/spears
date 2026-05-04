'use client';

export default function FormShell({ title, onBack, onSubmit, children }) {
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand"
        >
          ← Back
        </button>

        <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>

        <form
          onSubmit={onSubmit}
          className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          {children}
        </form>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand focus:ring-1 focus:ring-brand';
