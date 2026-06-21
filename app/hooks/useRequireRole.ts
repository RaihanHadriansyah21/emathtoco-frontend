'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/components/AuthGate';
import { normalizeRole } from '@/lib/utils';

export function useRequireRole(allowedRole: 'admin' | 'dosen' | 'mahasiswa') {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAuthorized = user ? normalizeRole(user.role) === allowedRole : false;
  const isLoading = loading;
  const userName = user?.nama_lengkap || '';

  useEffect(() => {
    if (loading) return;

    if (!user) {
      document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
      router.push('/login');
      return;
    }

    const userRole = normalizeRole(user.role);
    if (userRole !== allowedRole) {
      // Redirect based on role mismatch
      if (userRole === 'admin') {
        router.push('/admin');
      } else if (userRole === 'dosen') {
        router.push('/dosen');
      } else {
        router.push('/');
      }
    }
  }, [user, loading, allowedRole, router]);

  return { isLoading, isAuthorized, userName };
}
