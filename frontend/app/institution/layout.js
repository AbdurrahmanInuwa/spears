'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import { InstitutionProvider } from './InstitutionContext';
import Sidebar from './Sidebar';
import MobileDrawer from '../components/MobileDrawer';
import MobileTopBar from '../components/MobileTopBar';

export default function InstitutionLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, loading } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && (!user || role !== 'institution')) {
      router.replace('/signin?tab=institution');
    }
  }, [loading, user, role, router]);

  if (loading || !user) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <InstitutionProvider>
      <div className="flex h-dvh w-full overflow-hidden">
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Sidebar />
        </MobileDrawer>
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <MobileTopBar onMenu={() => setDrawerOpen(true)} />
          <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
        </div>
      </div>
    </InstitutionProvider>
  );
}
