'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import FullscreenLoader from './FullscreenLoader';

export interface UserProfile {
  id: string;
  email: string;
  nama_lengkap: string;
  role: string;
  foto_profil_url: string | null;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  refresh: (force?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => undefined,
});

const publicPrefixes = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/register',
];
const AUTH_CHECK_TIMEOUT_MS = 3000;

async function getCurrentUserWithTimeout() {
  return Promise.race([
    supabase.auth.getUser(),
    new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new Error('AUTH_CHECK_TIMEOUT')),
        AUTH_CHECK_TIMEOUT_MS,
      );
    }),
  ]);
}

export const useAuth = () => useContext(AuthContext);

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await getCurrentUserWithTimeout();
      if (error || !data.user) {
        setUser(null);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profil_pengguna')
        .select('nama_lengkap, role, foto_profil_url')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      setUser({
        id: data.user.id,
        email: data.user.email ?? '',
        nama_lengkap: profile?.nama_lengkap ?? 'User',
        role: normalizeRole(profile?.role ?? 'mahasiswa'),
        foto_profil_url: profile?.foto_profil_url ?? null,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
        if (!publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
          router.replace('/login');
        }
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, refresh, router]);

  const context = useMemo(
    () => ({ user, loading, refresh }),
    [user, loading, refresh],
  );

  if (loading) {
    return <FullscreenLoader />;
  }

  return (
    <AuthContext.Provider value={context}>
      {children}
    </AuthContext.Provider>
  );
}
