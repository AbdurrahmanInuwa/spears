'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, ageFromDob } from '../lib/auth';
import { apiFetch } from '../lib/api';

const NAV = [
  { label: 'Emergency', href: '/dashboard/emergency' },
  { label: 'Family', href: '/dashboard/family', adultOnly: true },
  { label: 'Volunteer', href: '/dashboard/volunteer', adultOnly: true },
  { label: 'Hardware', href: '/dashboard/hardware' },
  { label: 'Profile', href: '/dashboard/profile' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const age = ageFromDob(user?.dob);
  const isAdult = age == null ? true : age >= 18;
  // Under-18s who have been added to a family by an adult relative are
  // allowed to view the Family tab. Pull this lazily.
  const [inFamilyAsMinor, setInFamilyAsMinor] = useState(false);
  useEffect(() => {
    if (!user?.id || isAdult) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/family/me');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.family) setInFamilyAsMinor(true);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isAdult]);

  async function handleLogout() {
    await logout();
    router.push('/signin');
  }

  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col border-r border-slate-200 bg-white">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 border-b border-slate-200 px-6 py-5"
      >
        <span className="text-2xl font-extrabold tracking-tight text-brand">
          SPAERS
        </span>
      </Link>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          // Family is special: under-18s can access only if added as a member
          const familyOverride =
            item.label === 'Family' && inFamilyAsMinor && !isAdult;
          const disabled = item.adultOnly && !isAdult && !familyOverride;
          const isActive = pathname === item.href;

          if (disabled) {
            return (
              <span
                key={item.label}
                className="block cursor-not-allowed rounded-md px-3 py-2 text-sm font-medium text-slate-300"
                title="Available to users 18 and over"
              >
                {item.label}
              </span>
            );
          }

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
              {user.firstName} {user.lastName}
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
