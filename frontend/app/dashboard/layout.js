'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth';
import Sidebar from './Sidebar';
import MobileDrawer from '../components/MobileDrawer';
import MobileTopBar from '../components/MobileTopBar';
import { EmergencyProvider } from './EmergencyContext';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, role, loading } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auto-close the drawer when the route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && (!user || role !== 'citizen')) {
      router.replace('/signin');
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
    <EmergencyProvider>
      <div className="flex h-dvh w-full overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>
        {/* Mobile drawer */}
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <Sidebar />
        </MobileDrawer>
        {/* Main column */}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <MobileTopBar onMenu={() => setDrawerOpen(true)} />
          <main className="flex-1 overflow-y-auto bg-slate-50">{children}</main>
        </div>
      </div>
    </EmergencyProvider>
  );
}
