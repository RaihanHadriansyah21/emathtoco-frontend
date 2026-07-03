'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/components/AuthGate';
import { normalizeRole } from '@/lib/utils';

export function useRequireRole(allowedRole: 'admin' | 'dosen' | 'mahasiswa') {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Use ref to avoid adding `router` to effect deps.
  // Next.js useRouter() returns a new object reference on every render,
  // which would cause the effect to re-run infinitely.
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);

  const isAuthorized = user ? normalizeRole(user.role) === allowedRole : false;
  const isLoading = loading;
  const userName = user?.nama_lengkap || '';

  useEffect(() => {
    if (loading) return;

    if (!user) {
      routerRef.current.push('/login');
      return;
    }

    const userRole = normalizeRole(user.role);
    if (userRole !== allowedRole) {
      // Redirect based on role mismatch
      if (userRole === 'admin') {
        routerRef.current.push('/admin');
      } else if (userRole === 'dosen') {
        routerRef.current.push('/dosen');
      } else {
        routerRef.current.push('/');
      }
    }
  }, [user, loading, allowedRole]); // FIXED: `router` removed — was causing redirect loops

  return { isLoading, isAuthorized, userName };
}
