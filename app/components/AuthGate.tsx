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
    console.count("[AUTHGATE] RENDER");
    const router = useRouter();
    const pathname = usePathname();
    
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    const checkAuthPromiseRef = useRef<Promise<void> | null>(null);
    const checkAuthRequestIdRef = useRef(0);
    const routerRefCounter = useRef(0);
    const mountTimeRef = useRef(Date.now());

    useEffect(() => {
        const mountedDuration = Date.now() - mountTimeRef.current;
        console.log(`[PERF] [AUTH] AuthGate mounted in ${mountedDuration}ms`);
    }, []);

    useEffect(() => {
        routerRefCounter.current++;
        console.log(
            "[AUTHGATE] ROUTER_REFERENCE_CHANGED",
            routerRefCounter.current
        );
    }, [router]);

    useEffect(() => {
        if (process.env.NODE_ENV !== 'development') return;
        const interval = setInterval(() => {
            if (
                typeof window !== "undefined" &&
                "memory" in performance
            ) {
                console.log(
                    "[MEMORY]",
                    (performance as any).memory.usedJSHeapSize
                );
            }
        }, 30000);
        return () => clearInterval(interval);
    }, []);

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
        console.count("[AUTHGATE] CHECK_AUTH");
        console.time("[AUTHGATE] CHECK_AUTH_DURATION");
        if (checkAuthPromiseRef.current) {
            console.log('[AuthGate] checkAuth already in progress, reusing promise...');
            return checkAuthPromiseRef.current;
        }

        console.log('[AuthGate] checkAuth starting...');
        const checkAuthStart = Date.now();
        const requestId = ++checkAuthRequestIdRef.current;

        const promise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout limit

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
                        
                        console.log('[AuthGate] Fetching profile from database...');
                        console.count("[AUTHGATE] PROFILE_FETCH");
                        
                        const profileFetchStart = Date.now();
                        // Fetch role from profile table for route-level defense-in-depth
                        const { data: profile, error: profileError } = await supabase
                            .from('profil_pengguna')
                            .select('nama_lengkap, role, foto_profil_url')
                            .eq('id', authUser.id)
                            .abortSignal(controller.signal)
                            .maybeSingle();

                        const profileFetchDuration = Date.now() - profileFetchStart;
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
                        router.replace('/login');
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
                console.log(`[PERF] [AUTH] checkAuth completed in ${totalDuration}ms`);
                console.timeEnd("[AUTHGATE] CHECK_AUTH_DURATION");
            }
        })();

        checkAuthPromiseRef.current = promise;
        return promise;
    }, [router, handleSignOut]);

    // Run initial auth check and listen for session changes
    useEffect(() => {
        setIsMounted(true);
        
        // Safety timeout fallback: if auth checks hang for more than 6 seconds, force-disable the loader
        const safetyTimeout = setTimeout(() => {
            console.warn('[AuthGate] Safety timeout triggered. Forcing loader disable.');
            setLoading(false);
        }, 6000);

        checkAuth().then(() => {
            clearTimeout(safetyTimeout);
        });

        // Listen for authentication changes (e.g. login, logout, password recovery)
        console.count("[AUTHGATE] AUTH_SUBSCRIBE");
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.count(`[AUTH_EVENT] ${event}`);
            console.log(
                "[AUTH_EVENT]",
                event,
                {
                    hasSession: !!session,
                    userId: session?.user?.id
                }
            );
            console.log(`[AuthGate] Auth event: ${event}`);
            
            if (event === 'INITIAL_SESSION') {
                clearTimeout(safetyTimeout);
                if (!session) {
                    setLoading(false);
                }
            }
            
            if (event === 'PASSWORD_RECOVERY') {
                console.log("[AUTH GATE] PASSWORD_RECOVERY event triggered. Redirecting to /reset-password...");
                if (session) {
                    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                }
                setLoading(false);
                router.replace('/reset-password');
                return;
            }

            if (event === 'SIGNED_OUT') {
                handleSignOut();
                setLoading(false);
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session) {
                    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                }
                
                const currentPath = window.location.pathname;
                const isPublic = currentPath.startsWith('/login') || 
                                 currentPath.startsWith('/forgot-password') || 
                                 currentPath.startsWith('/reset-password') || 
                                 currentPath.startsWith('/register');
                
                if (isPublic) {
                    // Let the login/register/reset pages handle their own redirection
                    return;
                }
                
                await checkAuth();
            }
        });

        return () => {
            console.count("[AUTHGATE] AUTH_UNSUBSCRIBE");
            subscription.unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, [checkAuth, handleSignOut, router]);

    // Perform route guarding locally and synchronously on path/user changes
    useEffect(() => {
        if (!isMounted || loading) return;

        const currentPath = pathname;

        if (!user) {
            const isPublic = currentPath.startsWith('/login') || 
                             currentPath.startsWith('/forgot-password') || 
                             currentPath.startsWith('/reset-password') || 
                             currentPath.startsWith('/register');
            if (!isPublic) {
                router.replace('/login');
            }
            return;
        }

        const role = user.role;
        const normalizedUserRole = normalizeRole(role);

        // Guard routes based on user role
        if (normalizedUserRole === 'mahasiswa') {
            if (currentPath.startsWith('/dosen') || currentPath.startsWith('/admin')) {
                router.replace('/');
                return;
            }
        } else if (normalizedUserRole === 'dosen') {
            if (currentPath.startsWith('/admin') || currentPath === '/') {
                router.replace('/dosen');
                return;
            }
        } else if (normalizedUserRole === 'admin') {
            if (currentPath === '/' || currentPath.startsWith('/dosen')) {
                router.replace('/admin');
                return;
            }
        }

        if (currentPath.startsWith('/login') || currentPath.startsWith('/register') || currentPath.startsWith('/forgot-password')) {
            if (normalizedUserRole === 'dosen') {
                router.replace('/dosen');
            } else if (normalizedUserRole === 'admin') {
                router.replace('/admin');
            } else {
                router.replace('/');
            }
        }
    }, [pathname, user, isMounted, loading, router]);

    // Helper to determine if current route is authorized for rendering
    const isAuthorizedRoute = () => {
        if (!isMounted || loading) return false;

        const currentPath = pathname;
        const isPublic = currentPath.startsWith('/login') || 
                         currentPath.startsWith('/forgot-password') || 
                         currentPath.startsWith('/reset-password') || 
                         currentPath.startsWith('/register');

        if (!user) {
            return isPublic;
        }

        // Logged-in users should be redirected away from public auth pages, so show loader
        if (isPublic) {
            return false;
        }

        const role = normalizeRole(user.role);

        if (role === 'mahasiswa') {
            if (currentPath.startsWith('/dosen') || currentPath.startsWith('/admin')) {
                return false;
            }
        } else if (role === 'dosen') {
            if (currentPath.startsWith('/admin') || currentPath === '/') {
                return false;
            }
        } else if (role === 'admin') {
            if (currentPath === '/' || currentPath.startsWith('/dosen')) {
                return false;
            }
        }

        return true;
    };

    const authContextValue = useMemo(() => ({
        user,
        loading,
        refresh: checkAuth
    }), [user, loading, checkAuth]);

    const currentPath = pathname || '';
    const isPublic = currentPath.startsWith('/login') || 
                     currentPath.startsWith('/forgot-password') || 
                     currentPath.startsWith('/reset-password') || 
                     currentPath.startsWith('/register');

    // If it's a public path, render it immediately even if we are still loading/mounting
    if (isPublic) {
        return (
            <AuthContext.Provider value={authContextValue}>
                <div className="animate-in fade-in duration-200 h-full w-full flex flex-col flex-1">
                    {children}
                </div>
            </AuthContext.Provider>
        );
    }

    // During SSR, or until mounted, show fullscreen loader to prevent content flash
    if (!isMounted || loading) {
        return <FullscreenLoader />;
    }

    console.count(
        "[AUTHGATE] CONTEXT_VALUE_CREATED"
    );
    console.log(
        "[AUTHGATE] Context Dependencies",
        {
            userId: user?.id,
            loading
        }
    );

    return (
        <AuthContext.Provider value={authContextValue}>
            <div className="animate-in fade-in duration-200 h-full w-full flex flex-col flex-1">
                {isAuthorizedRoute() ? children : <FullscreenLoader />}
            </div>
        </AuthContext.Provider>
    );
}
