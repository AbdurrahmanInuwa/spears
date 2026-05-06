'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InstitutionIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/institution/emergency');
  }, [router]);
  return null;
}
