"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { normalizeRole } from "@/lib/utils";
import FullscreenLoader from "./FullscreenLoader";

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
  "/login",
  "/forgot-password",
  "/reset-password",
  "/register",
  "/join-class",
];
const AUTH_CHECK_TIMEOUT_MS = 3000;

function isPublicPath(pathname: string): boolean {
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

async function getCurrentUserWithTimeout() {
  return Promise.race([
    supabase.auth.getUser(),
    new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("AUTH_CHECK_TIMEOUT")),
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
  const [redirecting, setRedirecting] = useState(false);
  const bootstrappedRef = useRef(false);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    if (isPublicPath(pathname)) {
      setRedirecting(false);
    }
  }, [pathname]);

  const refresh = useCallback(async (force = false) => {
    const shouldBlockUi = force || !bootstrappedRef.current;
    if (shouldBlockUi) {
      setLoading(true);
    }
    try {
      const { data, error } = await getCurrentUserWithTimeout();
      if (error || !data.user) {
        setUser(null);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profil_pengguna")
        .select("nama_lengkap, role, foto_profil_url")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      setUser({
        id: data.user.id,
        email: data.user.email ?? "",
        nama_lengkap: profile?.nama_lengkap ?? "User",
        role: normalizeRole(profile?.role ?? "mahasiswa"),
        foto_profil_url: profile?.foto_profil_url ?? null,
      });
    } catch (error) {
      logger.warn("AuthGate refresh failed; clearing local user state.", error);
      setUser(null);
    } finally {
      bootstrappedRef.current = true;
      if (shouldBlockUi) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        bootstrappedRef.current = true;
        setLoading(false);
        if (!isPublicPath(pathnameRef.current)) {
          setRedirecting(true);
          router.replace("/login");
        }
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        setRedirecting(true);
        router.replace("/reset-password");
        return;
      }

      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void refresh(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh, router]);

  useEffect(() => {
    if (loading || user || isPublicPath(pathname)) return;
    setRedirecting(true);
    router.replace("/login");
  }, [loading, pathname, router, user]);

  const context = useMemo(
    () => ({ user, loading, refresh }),
    [user, loading, refresh],
  );

  if (loading || redirecting) {
    return <FullscreenLoader />;
  }

  return (
    <AuthContext.Provider value={context}>{children}</AuthContext.Provider>
  );
}
