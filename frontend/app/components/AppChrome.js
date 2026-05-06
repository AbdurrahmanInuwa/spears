'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';

// Wraps the app in the public Header + Footer chrome — except inside the
// authenticated dashboard, where the sidebar takes over.
export default function AppChrome({ children }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith('/dashboard');
  const isInstitution = pathname?.startsWith('/institution');
  const isPublicResponder =
    pathname?.startsWith('/e/') ||
    pathname?.startsWith('/d/') ||
    pathname?.startsWith('/v/');
  const isAdmin = pathname?.startsWith('/d/f/g/h/admin');

  if (isDashboard || isInstitution || isPublicResponder || isAdmin) {
    return children;
  }
  return (
    <>
      <Header />
      <main className="flex-1 md:min-h-0 md:overflow-y-auto">{children}</main>
      <Footer />
    </>
  );
}
