'use client';

// Slim top bar shown only on mobile inside dashboards. Has a hamburger
// button on the left that opens the off-canvas drawer.
export default function MobileTopBar({ onMenu, title = 'SPAERS' }) {
  return (
    <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        className="-ml-1 flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      <p className="text-base font-extrabold tracking-tight text-brand">
        {title}
      </p>
    </header>
  );
}
