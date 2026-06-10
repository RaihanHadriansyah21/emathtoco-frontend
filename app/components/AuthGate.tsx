'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import FullscreenLoader from './FullscreenLoader';

export default function AuthGate({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    
    const [loading, setLoading] = useState(true);
    const [isMounted, setIsMounted] = useState(false);
    
    // Use ref to track current pathname to avoid stale closures in listeners
    const pathnameRef = useRef(pathname);
    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    useEffect(() => {
        setIsMounted(true);

        const checkAuth = async () => {
            try {
                const currentPath = pathnameRef.current;
                
                // Bypass auth gate controls entirely for reset-password page to prevent race conditions and redirects
                if (currentPath === '/reset-password') {
                    setLoading(false);
                    return;
                }

                const isPublicRoute = 
                    currentPath.startsWith('/login') || 
                    currentPath === '/register' || 
                    currentPath === '/forgot-password' || 
                    currentPath === '/reset-password';

                // 1. Get current session
                const { data: { session } } = await supabase.auth.getSession();
                
                if (!session) {
                    // User is not logged in
                    if (!isPublicRoute) {
                        // Clear cookie to prevent middleware conflicts
                        document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                        router.replace('/login');
                    } else {
                        // Let them stay on login/register
                        setLoading(false);
                    }
                    return;
                }

                // 2. Validate token/user
                const { data: { user }, error: userError } = await supabase.auth.getUser();
                if (userError || !user) {
                    await supabase.auth.signOut();
                    document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                    if (!isPublicRoute) {
                        router.replace('/login');
                    } else {
                        setLoading(false);
                    }
                    return;
                }

                // Write cookie to keep middleware happy
                document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;

                // 3. Fetch user profile from DB
                const { data: profile, error: profileError } = await supabase
                    .from('profil_pengguna')
                    .select('role')
                    .eq('id', user.id)
                    .maybeSingle();

                if (profileError) {
                    console.error('[AUTH GATE] Profile fetch error:', profileError);
                    // Stay on current page but stop loading if we hit an error to prevent blank screen
                    setLoading(false);
                    return;
                }

                // 4. Handle incomplete profile
                if (!profile) {
                    if (currentPath !== '/complete-profile') {
                        router.replace('/complete-profile');
                    } else {
                        setLoading(false);
                    }
                    return;
                }

                // 5. Handle completed profile routing
                const userRole = normalizeRole(profile.role || 'mahasiswa');

                if (isPublicRoute) {
                    // Authenticated user trying to access login/register
                    if (userRole === 'admin') {
                        router.replace('/admin');
                    } else if (userRole === 'dosen') {
                        router.replace('/dosen');
                    } else {
                        router.replace('/');
                    }
                    return;
                }

                if (currentPath === '/complete-profile') {
                    // Profile is already completed, get them out of onboarding
                    if (userRole === 'admin') {
                        router.replace('/admin');
                    } else if (userRole === 'dosen') {
                        router.replace('/dosen');
                    } else {
                        router.replace('/');
                    }
                    return;
                }

                // 6. Role-based route guard
                const isAdminRoute = currentPath.startsWith('/admin');
                const isDosenRoute = currentPath.startsWith('/dosen');
                const isSharedRoute = currentPath === '/profile' || currentPath.startsWith('/profile/') ||
                                      currentPath === '/settings' || currentPath.startsWith('/settings/');

                if (userRole === 'admin') {
                    if (isAdminRoute || isSharedRoute) {
                        setLoading(false);
                    } else {
                        router.replace('/admin');
                    }
                } else if (userRole === 'dosen') {
                    if (isDosenRoute || isSharedRoute) {
                        setLoading(false);
                    } else {
                        router.replace('/dosen');
                    }
                } else {
                    // Mahasiswa
                    if (isAdminRoute || isDosenRoute) {
                        router.replace('/');
                    } else {
                        setLoading(false);
                    }
                }
            } catch (err) {
                console.error('[AUTH GATE] Exception during check:', err);
                setLoading(false);
            }
        };

        // Run initial auth check
        checkAuth();

        // Listen for authentication changes (e.g. login, logout, password recovery)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("AUTH EVENT:", event);
            console.log("SESSION:", session);
            if (typeof window !== 'undefined') {
                console.log("CURRENT PATH:", window.location.pathname);
                console.log("RECOVERY URL:", window.location.href);
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
                document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                setLoading(true);
                router.replace('/login');
            } else if (event === 'SIGNED_IN') {
                if (session) {
                    document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                }
                setLoading(true);
                checkAuth();
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [router, pathname]);

    // During SSR, or until mounted, show fullscreen loader to prevent content flash
    if (!isMounted || loading) {
        return <FullscreenLoader />;
    }

    return (
        <div className="animate-in fade-in duration-200 h-full w-full flex flex-col flex-1">
            {children}
        </div>
    );
}
