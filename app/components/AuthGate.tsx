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
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    const { data: { user }, error } = await supabase.auth.getUser();
                    if (user && !error) {
                        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                        
                        const currentPath = pathnameRef.current;
                        if (currentPath.startsWith('/login') || currentPath.startsWith('/register') || currentPath.startsWith('/forgot-password')) {
                            router.replace('/');
                        }
                    } else {
                        handleSignOut();
                    }
                } else {
                    const currentPath = pathnameRef.current;
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
            document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
            const currentPath = pathnameRef.current;
            const isPublic = currentPath.startsWith('/login') || 
                             currentPath.startsWith('/forgot-password') || 
                             currentPath.startsWith('/reset-password') || 
                             currentPath.startsWith('/register');
            if (!isPublic) {
                router.replace('/login');
            }
        };

        // Run initial auth check
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
                
                const currentPath = pathnameRef.current;
                const isPublic = currentPath.startsWith('/login') || 
                                 currentPath.startsWith('/forgot-password') || 
                                 currentPath.startsWith('/reset-password') || 
                                 currentPath.startsWith('/register');
                
                if (isPublic && event === 'SIGNED_IN' && session) {
                    setLoading(true);
                    router.replace('/');
                } else {
                    await checkAuth();
                }
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
