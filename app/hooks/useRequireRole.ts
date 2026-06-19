'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';

export function useRequireRole(allowedRole: 'admin' | 'dosen' | 'mahasiswa') {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    let active = true;

    const checkRole = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          if (active) {
            setIsAuthorized(false);
            setIsLoading(false);
            // Clear cookie and redirect
            document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
            router.push('/login');
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profil_pengguna')
          .select('role, nama_lengkap')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError || !profile) {
          if (active) {
            setIsAuthorized(false);
            setIsLoading(false);
            router.push('/complete-profile');
          }
          return;
        }

        const userRole = normalizeRole(profile.role);
        if (userRole !== allowedRole) {
          if (active) {
            setIsAuthorized(false);
            setIsLoading(false);
            // Redirect based on role mismatch
            if (userRole === 'admin') {
              router.push('/admin');
            } else if (userRole === 'dosen') {
              router.push('/dosen');
            } else {
              router.push('/');
            }
          }
          return;
        }

        if (active) {
          setUserName(profile.nama_lengkap || 'User');
          setIsAuthorized(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[useRequireRole] Error:', err);
        if (active) {
          setIsAuthorized(false);
          setIsLoading(false);
          router.push('/');
        }
      }
    };

    checkRole();

    return () => {
      active = false;
    };
  }, [allowedRole, router]);

  return { isLoading, isAuthorized, userName };
}
