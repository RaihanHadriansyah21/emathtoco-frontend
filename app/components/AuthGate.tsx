'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
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
    const router = useRouter();
    const pathname = usePathname();
    
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMounted, setIsMounted] = useState(false);

    const checkAuth = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data: { user: authUser }, error } = await supabase.auth.getUser();
                if (authUser && !error) {
                    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                    
                    // Fetch role from profile table for route-level defense-in-depth
                    const { data: profile } = await supabase
                        .from('profil_pengguna')
                        .select('nama_lengkap, role, foto_profil_url')
                        .eq('id', authUser.id)
                        .maybeSingle();

                    setUser({
                        id: authUser.id,
                        email: authUser.email || '',
                        nama_lengkap: profile?.nama_lengkap || 'User',
                        role: profile?.role || 'mahasiswa',
                        foto_profil_url: profile?.foto_profil_url || null,
                    });
                } else {
                    handleSignOut();
                }
            } else {
                setUser(null);
                const currentPath = window.location.pathname;
                const isPublic = currentPath.startsWith('/login') || 
                                 currentPath.startsWith('/forgot-password') || 
                                 currentPath.startsWith('/reset-password') || 
                                 currentPath.startsWith('/register');
                if (!isPublic) {
                    router.replace('/login');
                }
            }
        } catch (err) {
            console.error('[AuthGate] checkAuth error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = () => {
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
    };

    // Run initial auth check and listen for session changes
    useEffect(() => {
        setIsMounted(true);
        checkAuth();

        // Listen for authentication changes (e.g. login, logout, password recovery)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[AuthGate] Auth event: ${event}`);
            
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
            subscription.unsubscribe();
        };
    }, []);

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

    // During SSR, or until mounted, show fullscreen loader to prevent content flash
    if (!isMounted || loading) {
        return <FullscreenLoader />;
    }

    return (
        <AuthContext.Provider value={{ user, loading, refresh: checkAuth }}>
            <div className="animate-in fade-in duration-200 h-full w-full flex flex-col flex-1">
                {isAuthorizedRoute() ? children : <FullscreenLoader />}
            </div>
        </AuthContext.Provider>
    );
}
