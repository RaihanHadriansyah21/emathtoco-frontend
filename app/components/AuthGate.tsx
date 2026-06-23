'use client';

import React, { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
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
    refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    refresh: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function AuthGate({ children }: { children: React.ReactNode }) {

    // =========================================================================
    // PHASE 1 — RENDER REASON TRACKING
    // All tracking uses refs — zero setState — does NOT cause re-renders.
    // =========================================================================
    const renderIdRef = useRef(0);
    const prevUserIdRef = useRef<string | undefined>(undefined);
    const prevLoadingRef = useRef<boolean | undefined>(undefined);
    const prevPathnameRef = useRef<string | null | undefined>(undefined);
    const prevRouterRef = useRef<ReturnType<typeof useRouter> | undefined>(undefined);
    const prevCheckAuthRef_tracking = useRef<Function | undefined>(undefined);
    const prevHandleSignOutRef_tracking = useRef<Function | undefined>(undefined);

    // =========================================================================
    // HOOKS — all hooks declared before any early returns
    // =========================================================================
    const router = useRouter();
    const pathname = usePathname();

    // routerRef: always holds latest router; used in effects/callbacks to avoid
    // capturing a stale router and to avoid adding `router` to effect deps.
    const routerRef = useRef(router);
    useEffect(() => {
        routerRef.current = router;
    }, [router]);

    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMounted, setIsMounted] = useState(false);

    const checkAuthPromiseRef = useRef<Promise<void> | null>(null);
    const checkAuthRequestIdRef = useRef(0);
    const mountTimeRef = useRef(Date.now());

    // userRef: always holds latest user; used inside auth callbacks to avoid
    // stale closures in the subscription (which is created mount-only).
    const userRef = useRef<UserProfile | null>(null);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        const mountedDuration = Date.now() - mountTimeRef.current;
        console.log(`[PERF] [AUTH] AuthGate mounted in ${mountedDuration}ms`);
    }, []);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        const interval = setInterval(() => {
            if (typeof window !== 'undefined' && 'memory' in performance) {
                console.log('[MEMORY]', (performance as any).memory.usedJSHeapSize);
            }
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // =========================================================================
    // PHASE 4 — CALLBACK STABILITY
    // handleSignOut: deps=[] → identity is permanently stable.
    // checkAuth:     deps=[handleSignOut] → stable because handleSignOut is stable.
    // =========================================================================

    const handleSignOut = useCallback(() => {
        setUser(null);
        document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
        const currentPath = window.location.pathname;
        const isPublic = currentPath.startsWith('/login') ||
                         currentPath.startsWith('/forgot-password') ||
                         currentPath.startsWith('/reset-password') ||
                         currentPath.startsWith('/register');
        if (!isPublic) {
            window.location.href = '/login';
        }
    }, []);

    const checkAuth = useCallback(async () => {
        console.log('[CHECK_AUTH_START]', Date.now());
        console.count('[AUTHGATE] CHECK_AUTH');
        console.time('[AUTHGATE] CHECK_AUTH_DURATION');
        if (checkAuthPromiseRef.current) {
            console.log('[AuthGate] checkAuth already in progress, reusing promise...');
            return checkAuthPromiseRef.current;
        }

        console.log('[AuthGate] checkAuth starting...');
        const checkAuthStart = Date.now();
        const requestId = ++checkAuthRequestIdRef.current;

        const promise = (async () => {
            let profileFetchDuration = 0;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const getSessionStart = Date.now();
                const { data: { session } } = await supabase.auth.getSession();
                const getSessionDuration = Date.now() - getSessionStart;
                console.log(`[PERF] [AUTH] getSession completed in ${getSessionDuration}ms`);

                if (requestId !== checkAuthRequestIdRef.current) {
                    console.log('[AuthGate] Stale auth request ignored after getSession.');
                    return;
                }

                if (session) {
                    const authUser = session.user;
                    if (authUser) {
                        console.log('[AuthGate] User found in session:', authUser.id);
                        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;

                        // PHASE 9B: Skip DB profile fetch if user is already loaded.
                        // Supabase fires SIGNED_IN on every navigation. Re-fetching the profile
                        // on each event caused a 5-6 second UI freeze via the 5s AbortController.
                        // Profile data does not change between navigations — only the cookie needs updating.
                        // Full DB fetch only runs on cold start (userRef.current === null) or
                        // when refresh() is called explicitly by a consumer.
                        if (userRef.current !== null && userRef.current.id === authUser.id) {
                            console.log('[AuthGate] User already loaded. Skipping profile DB fetch. [PHASE_9B]');
                            clearTimeout(timeoutId);
                            return;
                        }

                        console.log('[AuthGate] Cold start or user change. Fetching profile from database...');
                        console.count('[AUTHGATE] PROFILE_FETCH');

                        const profileFetchStart = Date.now();
                        const { data: profile, error: profileError } = await supabase
                            .from('profil_pengguna')
                            .select('nama_lengkap, role, foto_profil_url')
                            .eq('id', authUser.id)
                            .abortSignal(controller.signal)
                            .maybeSingle();

                        profileFetchDuration = Date.now() - profileFetchStart;
                        console.log(`[PERF] [AUTH] Profile fetch completed in ${profileFetchDuration}ms`);

                        if (requestId !== checkAuthRequestIdRef.current) {
                            console.log('[AuthGate] Stale auth request ignored after profile fetch.');
                            return;
                        }

                        if (profileError) {
                            console.error('[AuthGate] Fetch profile error:', profileError);
                        }
                        console.log('[AuthGate] Profile query finished. Profile data:', profile);

                        setUser({
                            id: authUser.id,
                            email: authUser.email || '',
                            nama_lengkap: profile?.nama_lengkap || 'User',
                            role: profile?.role || 'mahasiswa',
                            foto_profil_url: profile?.foto_profil_url || null,
                        });
                        console.log('[AuthGate] User state set.');
                    } else {
                        console.warn('[AuthGate] No user in session, signing out...');
                        handleSignOut();
                    }
                } else {
                    console.log('[AuthGate] No session. Clearing user state...');
                    setUser(null);
                    const currentPath = window.location.pathname;
                    const isPublic = currentPath.startsWith('/login') ||
                                     currentPath.startsWith('/forgot-password') ||
                                     currentPath.startsWith('/reset-password') ||
                                     currentPath.startsWith('/register');
                    if (!isPublic) {
                        console.log('[AuthGate] Route is not public, redirecting to /login...');
                        routerRef.current.replace('/login');
                    }
                }
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.error('[PERF] [AUTH] Profile fetch timed out (5s)');
                } else {
                    console.error('[AuthGate] checkAuth error:', err);
                }
            } finally {
                clearTimeout(timeoutId);
                if (requestId === checkAuthRequestIdRef.current) {
                    console.log('[AuthGate] checkAuth finished. Setting loading to false.');
                    setLoading(false);
                    checkAuthPromiseRef.current = null;
                }
                const totalDuration = Date.now() - checkAuthStart;
                console.log('[CHECK_AUTH_END]', Date.now(), { totalDuration, profileFetchDuration });
                console.log(`[PERF] [AUTH] checkAuth completed in ${totalDuration}ms`);
                console.timeEnd('[AUTHGATE] CHECK_AUTH_DURATION');
            }
        })();

        checkAuthPromiseRef.current = promise;
        return promise;
    }, [handleSignOut]);

    // =========================================================================
    // PHASE 5 — SUBSCRIPTION HARDENING
    // Stable refs for checkAuth and handleSignOut allow the subscription
    // useEffect to be mount-only (deps=[]).
    // A mount-only subscription is NEVER recreated on renders or navigations.
    // The refs are always kept in sync with the latest callback identity.
    // =========================================================================

    // These refs let the mount-only subscription always call the current version
    // of checkAuth/handleSignOut without capturing stale closures.
    const checkAuthRef = useRef(checkAuth);
    const handleSignOutRef = useRef(handleSignOut);
    useEffect(() => { checkAuthRef.current = checkAuth; }, [checkAuth]);
    useEffect(() => { handleSignOutRef.current = handleSignOut; }, [handleSignOut]);

    // PHASE 5 — AUTH SUBSCRIPTION: mount-only, never recreated.
    // All navigation uses routerRef.current (never the captured `router` closure).
    // All callbacks use their respective refs (checkAuthRef, handleSignOutRef).
    useEffect(() => {
        setIsMounted(true);

        // Safety timeout: if auth check hangs >6s, force-disable the loader.
        const safetyTimeout = setTimeout(() => {
            console.warn('[AuthGate] Safety timeout triggered. Forcing loader disable.');
            setLoading(false);
        }, 6000);

        checkAuthRef.current().then(() => {
            clearTimeout(safetyTimeout);
        });

        console.log('[AUTHGATE] AUTH_SUBSCRIBE', Date.now());
        console.count('[AUTHGATE] AUTH_SUBSCRIBE');

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[AUTH_EVENT]', event, Date.now(), { hasSession: !!session, userId: session?.user?.id });
            console.count(`[AUTH_EVENT] ${event}`);

            if (event === 'INITIAL_SESSION') {
                clearTimeout(safetyTimeout);
                if (!session) {
                    setLoading(false);
                }
                return;
            }

            if (event === 'PASSWORD_RECOVERY') {
                console.log('[AuthGate] PASSWORD_RECOVERY event. Redirecting to /reset-password...');
                if (session) {
                    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                }
                setLoading(false);
                // FIX: Use routerRef.current — not the captured `router` closure
                // (which was stale since subscription is mount-only).
                routerRef.current.replace('/reset-password');
                return;
            }

            if (event === 'SIGNED_OUT') {
                handleSignOutRef.current();
                setLoading(false);
                return;
            }

            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session) {
                    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                }

                // PHASE 9B: If user is already loaded, just update cookie and exit.
                // No need to invoke checkAuth (which triggers an expensive DB fetch).
                if (userRef.current !== null) {
                    console.log('[AuthGate] SIGNED_IN/TOKEN_REFRESHED with existing user. Cookie updated; skipping checkAuth(). [PHASE_9B]');
                    return;
                }

                const currentPath = window.location.pathname;
                const isPublic = currentPath.startsWith('/login') ||
                                 currentPath.startsWith('/forgot-password') ||
                                 currentPath.startsWith('/reset-password') ||
                                 currentPath.startsWith('/register');
                if (isPublic) {
                    // Let the login/register/reset pages handle their own redirection.
                    return;
                }

                await checkAuthRef.current();
            }
        });

        return () => {
            console.log('[AUTHGATE] AUTH_UNSUBSCRIBE', Date.now());
            console.count('[AUTHGATE] AUTH_UNSUBSCRIBE');
            subscription.unsubscribe();
            clearTimeout(safetyTimeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // MOUNT-ONLY: subscription is created once and never recreated.

    // =========================================================================
    // PHASE 3 — ROUTE GUARD: `router` REMOVED from deps
    //
    // ROOT CAUSE OF THE RENDER LOOP (Line 355 in previous version):
    //   }, [pathname, user, isMounted, loading, router]);
    //                                             ^^^^^^ THIS
    //
    // Next.js useRouter() returns a NEW object reference on every render.
    // Having `router` in this effect's deps caused:
    //   render → new router ref → effect runs → router.replace() → navigation
    //   state update → re-render → new router ref → effect runs → ...
    //
    // FIX: All router.replace() calls now use routerRef.current.
    //      `router` is removed from the dependency array entirely.
    //      Route guard logic is identical — only the reference source changed.
    // =========================================================================
    useEffect(() => {
        if (!isMounted || loading) return;

        const currentPath = pathname;

        if (!user) {
            const isPublic = currentPath.startsWith('/login') ||
                             currentPath.startsWith('/forgot-password') ||
                             currentPath.startsWith('/reset-password') ||
                             currentPath.startsWith('/register');
            if (!isPublic) {
                routerRef.current.replace('/login'); // FIX: was router.replace
            }
            return;
        }

        const normalizedUserRole = normalizeRole(user.role);

        if (normalizedUserRole === 'mahasiswa') {
            if (currentPath.startsWith('/dosen') || currentPath.startsWith('/admin')) {
                routerRef.current.replace('/'); // FIX: was router.replace
                return;
            }
        } else if (normalizedUserRole === 'dosen') {
            if (currentPath.startsWith('/admin') || currentPath === '/') {
                routerRef.current.replace('/dosen'); // FIX: was router.replace
                return;
            }
        } else if (normalizedUserRole === 'admin') {
            if (currentPath === '/' || currentPath.startsWith('/dosen')) {
                routerRef.current.replace('/admin'); // FIX: was router.replace
                return;
            }
        }

        if (currentPath.startsWith('/login') || currentPath.startsWith('/register') || currentPath.startsWith('/forgot-password')) {
            if (normalizedUserRole === 'dosen') {
                routerRef.current.replace('/dosen'); // FIX: was router.replace
            } else if (normalizedUserRole === 'admin') {
                routerRef.current.replace('/admin'); // FIX: was router.replace
            } else {
                routerRef.current.replace('/');      // FIX: was router.replace
            }
        }
    }, [pathname, user, isMounted, loading]); // FIXED: `router` removed — was the primary render loop source

    // =========================================================================
    // PHASE 2 — CONTEXT STABILITY
    // authContextValue is memoized. It only changes when user, loading, or
    // checkAuth identity changes. checkAuth is stable (useCallback with stable
    // deps), so this value is highly stable.
    // =========================================================================
    const authContextValue = useMemo(() => ({
        user,
        loading,
        refresh: checkAuth,
    }), [user, loading, checkAuth]);

    // =========================================================================
    // PHASE 1 — RENDER REASON LOGGING (runs on every render, ref-based only)
    // This block is placed AFTER all hook declarations but BEFORE early returns.
    // Uses ONLY refs and console — zero state mutations — cannot cause re-renders.
    // =========================================================================
    renderIdRef.current++;
    if (process.env.NODE_ENV === 'development') {
        const renderId = renderIdRef.current;
        const userIdChanged = prevUserIdRef.current !== user?.id;
        const loadingChanged = prevLoadingRef.current !== undefined && prevLoadingRef.current !== loading;
        const pathnameChanged = prevPathnameRef.current !== undefined && prevPathnameRef.current !== pathname;
        const routerChanged = prevRouterRef.current !== undefined && !Object.is(prevRouterRef.current, router);
        const checkAuthChanged = prevCheckAuthRef_tracking.current !== undefined && !Object.is(prevCheckAuthRef_tracking.current, checkAuth);
        const handleSignOutChanged = prevHandleSignOutRef_tracking.current !== undefined && !Object.is(prevHandleSignOutRef_tracking.current, handleSignOut);

        // Update tracking refs for next render comparison
        prevUserIdRef.current = user?.id;
        prevLoadingRef.current = loading;
        prevPathnameRef.current = pathname;
        prevRouterRef.current = router;
        prevCheckAuthRef_tracking.current = checkAuth;
        prevHandleSignOutRef_tracking.current = handleSignOut;

        console.log('[AUTHGATE_RENDER]', Date.now());
        console.count('[AUTHGATE] RENDER');
        console.log('[RENDER_REASON]', {
            render: renderId,
            // What changed since last render:
            userIdChanged,
            loadingChanged,
            pathnameChanged,
            routerChanged,   // If TRUE in a loop → router in useEffect deps is the cause
            checkAuthChanged,
            handleSignOutChanged,
            // Current values:
            userId: user?.id,
            loading,
            pathname,
        });
    }

    // =========================================================================
    // RENDER PATHS
    // =========================================================================

    const currentPath = pathname || '';
    const isPublic = currentPath.startsWith('/login') ||
                     currentPath.startsWith('/forgot-password') ||
                     currentPath.startsWith('/reset-password') ||
                     currentPath.startsWith('/register');

    // Public routes: render immediately without waiting for auth.
    if (isPublic) {
        return (
            <AuthContext.Provider value={authContextValue}>
                <div className="animate-in fade-in duration-200 h-full w-full flex flex-col flex-1">
                    {children}
                </div>
            </AuthContext.Provider>
        );
    }

    // Protected routes: block render until auth is resolved.
    if (!isMounted || loading) {
        return <FullscreenLoader />;
    }

    // =========================================================================
    // PHASE 6 — INSTRUMENTATION AUDIT
    // The CONTEXT_VALUE_CREATED log below does NOT use setState — it is a pure
    // console.count call on every render past this code path. It does NOT cause
    // re-renders. It is kept for diagnostic visibility.
    // =========================================================================
    if (process.env.NODE_ENV === 'development') {
        console.log('[AUTH_CONTEXT]', Date.now(), { userId: user?.id, loading });
        console.count('[AUTHGATE] CONTEXT_VALUE_CREATED');
    }

    // isAuthorizedRoute: determines whether to render children or a loader
    // based on current pathname and user role. This is a synchronous helper
    // called during render — it reads stable state (pathname, user) and does
    // NOT cause re-renders.
    const isAuthorizedRoute = (): boolean => {
        if (!isMounted || loading) return false;

        const isCurrentPublic = currentPath.startsWith('/login') ||
                                currentPath.startsWith('/forgot-password') ||
                                currentPath.startsWith('/reset-password') ||
                                currentPath.startsWith('/register');
        if (!user) return isCurrentPublic;
        if (isCurrentPublic) return false; // Logged-in user redirect is pending

        const role = normalizeRole(user.role);
        if (role === 'mahasiswa') {
            if (currentPath.startsWith('/dosen') || currentPath.startsWith('/admin')) return false;
        } else if (role === 'dosen') {
            if (currentPath.startsWith('/admin') || currentPath === '/') return false;
        } else if (role === 'admin') {
            if (currentPath === '/' || currentPath.startsWith('/dosen')) return false;
        }
        return true;
    };

    return (
        <AuthContext.Provider value={authContextValue}>
            <div className="animate-in fade-in duration-200 h-full w-full flex flex-col flex-1">
                {isAuthorizedRoute() ? children : <FullscreenLoader />}
            </div>
        </AuthContext.Provider>
    );
}
