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
  "/complete-profile",
];
const AUTH_CHECK_TIMEOUT_MS = 3000;
const PROFILE_FETCH_TIMEOUT_MS = 3000;

// These routes do not need an existing profile before their first paint. They
// remain public in the proxy; this only prevents an unnecessary full-screen
// wait while Supabase restores a persisted browser session.
const nonBlockingPublicPrefixes = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/register",
];

function isPublicPath(pathname: string): boolean {
  return publicPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function isNonBlockingPublicPath(pathname: string): boolean {
  return nonBlockingPublicPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

async function withBrowserTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
  timeoutCode: string,
): Promise<T> {
  let timeoutId: number | undefined;

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error(timeoutCode)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function getCurrentClaimsWithTimeout() {
  return withBrowserTimeout(
    supabase.auth.getClaims(),
    AUTH_CHECK_TIMEOUT_MS,
    "AUTH_CHECK_TIMEOUT",
  );
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
  // Tracks whether an auth event (e.g. SIGNED_IN from email callback) is
  // currently being processed. While true, the redirect-to-login effect
  // is suppressed to prevent the "blip" where the user briefly sees the
  // login page before the profile fetch completes.
  const pendingAuthEventRef = useRef(false);

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
      // getClaims() validates the current JWT and can use the Supabase JWKS
      // cache. It avoids a second /user round-trip when asymmetric signing is
      // available, while the proxy and database RLS remain the authority for
      // protected data.
      const { data, error } = await getCurrentClaimsWithTimeout();
      const userId = typeof data?.claims?.sub === "string"
        ? data.claims.sub
        : null;
      const email = typeof data?.claims?.email === "string"
        ? data.claims.email
        : "";

      if (error || !userId) {
        setUser(null);
        return;
      }

      const { data: profile, error: profileError } =
        await withBrowserTimeout(
          supabase
            .from("profil_pengguna")
            .select("nama_lengkap, role, foto_profil_url")
            .eq("id", userId)
            .maybeSingle(),
          PROFILE_FETCH_TIMEOUT_MS,
          "PROFILE_FETCH_TIMEOUT",
        );

      if (profileError) {
        throw profileError;
      }

      // User authenticated but no profile row yet → redirect to complete-profile
      if (!profile) {
        setUser({
          id: userId,
          email,
          nama_lengkap: "",
          role: "",
          foto_profil_url: null,
        });
        if (
          pathnameRef.current &&
          !pathnameRef.current.startsWith("/complete-profile") &&
          !isPublicPath(pathnameRef.current)
        ) {
          router.replace("/complete-profile");
        }
        return;
      }

      setUser({
        id: userId,
        email,
        nama_lengkap: profile.nama_lengkap ?? "User",
        role: normalizeRole(profile.role ?? "mahasiswa"),
        foto_profil_url: profile.foto_profil_url ?? null,
      });
    } catch (error) {
      logger.warn("AuthGate refresh failed; clearing local user state.", error);
      setUser(null);
    } finally {
      bootstrappedRef.current = true;
      pendingAuthEventRef.current = false;
      if (shouldBlockUi) {
        setLoading(false);
      }
    }
  }, [router]);

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
        // Set pending flag BEFORE refresh starts — this prevents the
        // redirect-to-login effect from firing while we're still
        // fetching the user profile, eliminating the page flicker.
        pendingAuthEventRef.current = true;
        void refresh(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh, router]);

  // Reset redirecting state when user successfully loads
  useEffect(() => {
    if (user && redirecting) {
      setRedirecting(false);
    }
  }, [user, redirecting]);

  useEffect(() => {
    if (loading || user || isPublicPath(pathname)) return;
    // Don't redirect to login while an auth event is being processed.
    // This prevents the "blip" where user briefly sees the login page
    // before the SIGNED_IN refresh completes.
    if (pendingAuthEventRef.current) return;
    setRedirecting(true);
    router.replace("/login");
  }, [loading, pathname, router, user]);

  useEffect(() => {
    if (!user || !isNonBlockingPublicPath(pathname)) return;

    const destination = !user.role
      ? "/complete-profile"
      : user.role === "admin"
        ? "/admin"
        : user.role === "dosen"
          ? "/dosen"
          : "/";
    router.replace(destination);
  }, [pathname, router, user]);

  const context = useMemo(
    () => ({ user, loading, refresh }),
    [user, loading, refresh],
  );

  if (
    !isNonBlockingPublicPath(pathname) &&
    (loading || redirecting)
  ) {
    return <FullscreenLoader />;
  }

  return (
    <AuthContext.Provider value={context}>{children}</AuthContext.Provider>
  );
}
