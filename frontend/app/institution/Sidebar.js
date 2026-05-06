'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';

const NAV = [
  { label: 'Emergency', href: '/institution/emergency' },
  { label: 'Dispatchers', href: '/institution/dispatchers' },
  { label: 'History', href: '/institution/history' },
  { label: 'Settings', href: '/institution/settings' },
];

export default function InstitutionSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    router.push('/signin?tab=institution');
  }

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      <Link
        href="/institution"
        className="flex items-center gap-2 border-b border-slate-200 px-6 py-5"
      >
        <span className="text-2xl font-extrabold tracking-tight text-brand">
          SPAERS
        </span>
      </Link>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-brand text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        {user && (
          <div className="mb-2 px-2 text-xs text-slate-500">
            <p className="truncate font-medium text-slate-700">
              {user.name}
            </p>
            <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">
              {user.type}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
