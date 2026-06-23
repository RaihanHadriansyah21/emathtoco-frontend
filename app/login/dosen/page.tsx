'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { API_URL } from '@/lib/config';
import Image from 'next/image';
import Logo from '../../Emathtoco.png';
import { Eye, EyeOff, ArrowLeft, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import PageTransition from '@/components/ui/PageTransition';
import TextType from '@/components/ui/TextType';
import ShinyText from '@/components/ui/ShinyText';

// ─── Error classification helper ────────────────────────────────────────────
// ISSUE C FIX: Converts raw errors into accurate, user-facing Indonesian messages.
// Never conflates network failures with credential errors.
function classifyLoginError(err: unknown): string {
    if (err instanceof TypeError && (
        err.message.includes('fetch') ||
        err.message.includes('network') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('ERR_NAME_NOT_RESOLVED') ||
        err.message.includes('ERR_INTERNET_DISCONNECTED') ||
        err.message.includes('Load failed')
    )) {
        return 'Server tidak dapat dihubungi. Periksa koneksi internet Anda.';
    }
    if (err instanceof Error && err.name === 'AbortError') {
        return 'Koneksi timeout. Server tidak merespons dalam waktu yang ditentukan.';
    }
    return 'Terjadi kesalahan tidak terduga. Silakan coba lagi.';
}

function classifySupabaseError(error: { message?: string; status?: number } | null): string {
    if (!error) return '';

    const msg = (error.message || '').toLowerCase();
    const status = error.status;

    // Network-level failure surfaced through Supabase client
    if (
        msg.includes('fetch') ||
        msg.includes('network') ||
        msg.includes('failed to fetch') ||
        msg.includes('err_name_not_resolved') ||
        msg.includes('load failed') ||
        msg.includes('internet')
    ) {
        return 'Server autentikasi tidak dapat dihubungi. Periksa koneksi internet Anda.';
    }

    // Timeout
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return 'Koneksi timeout. Server tidak merespons. Silakan coba lagi.';
    }

    // HTTP 401 — wrong credentials
    if (status === 401 || msg.includes('invalid login credentials') || msg.includes('invalid password')) {
        return 'Email atau password salah! Silakan periksa kembali akun Anda.';
    }

    // HTTP 403 — forbidden / locked
    if (status === 403 || msg.includes('access denied') || msg.includes('forbidden')) {
        return 'Akses ditolak. Akun Anda mungkin telah dinonaktifkan.';
    }

    // HTTP 404 — user not found
    if (status === 404 || msg.includes('user not found')) {
        return 'Akun dengan email ini tidak ditemukan.';
    }

    // Rate limited
    if (status === 429 || msg.includes('rate limit') || msg.includes('too many')) {
        return 'Terlalu banyak percobaan login. Silakan tunggu beberapa menit.';
    }

    // Email not confirmed
    if (msg.includes('email not confirmed')) {
        return 'Email belum dikonfirmasi. Periksa kotak masuk email Anda.';
    }

    return 'Email atau password salah! Silakan periksa kembali akun Anda.';
}

export default function DosenLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, []);

    const togglePasswordVisibility = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        setShowPassword(true);

        timerRef.current = setTimeout(() => {
            setShowPassword(false);
        }, 2000);
    };

    useEffect(() => {
        const checkSession = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=${session.expires_in}; SameSite=Lax`;
                        router.push('/');
                        return;
                    } else {
                        await supabase.auth.signOut();
                    }
                }

                document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
            } catch (err) {
                console.error("Gagal memeriksa sesi login:", err);
            }
        };
        checkSession();
    }, [router]);

    /**
     * Sends audit log using keepalive fetch (survives page navigation/unload).
     * Falls back to navigator.sendBeacon if fetch fails.
     */
    const sendLoginAuditLog = (auditPayload: {
        action: string;
        target: string;
        details: any;
    }, token?: string) => {
        const url = `${API_URL}/audit/log`;
        const body = JSON.stringify(auditPayload);

        try {
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    'Accept': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body,
                keepalive: true,
            }).catch(() => {});
            console.log('[AUDIT DEBUG] keepalive fetch fired');
        } catch {
            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                const blob = new Blob([body], { type: 'application/json' });
                const sent = navigator.sendBeacon(url, blob);
                console.log(`[AUDIT DEBUG] sendBeacon fallback result: ${sent}`);
            }
        }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        if (!email || !password) {
            setErrorMessage('Wajib melampirkan email dan password yang benar!');
            return;
        }

        setIsLoading(true);

        try {
            // ── Email existence check (optional, non-blocking) ────────────────
            // ISSUE C FIX: Uses AbortController with 5s timeout.
            // On network failure, logs the error but does NOT block login.
            try {
                const checkUrl = `${API_URL}/auth/check-email?email=${encodeURIComponent(email)}`;
                const checkController = new AbortController();
                const checkTimeout = setTimeout(() => checkController.abort(), 5000);
                const checkRes = await fetch(checkUrl, {
                    headers: {
                        'ngrok-skip-browser-warning': 'true',
                        'Accept': 'application/json',
                    },
                    signal: checkController.signal,
                });
                clearTimeout(checkTimeout);

                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (checkData.exists === false) {
                        setErrorMessage('Email Anda belum terdaftar! Silakan hubungi admin untuk mendaftarkan akun Anda.');
                        setIsLoading(false);
                        return;
                    }
                } else {
                    console.warn('[LOGIN] check-email returned HTTP', checkRes.status, '— continuing to Supabase auth');
                }
            } catch (emailCheckError) {
                // ISSUE C FIX: Network/timeout error on check-email is NOT shown to user.
                // We log it and continue — Supabase auth is the authoritative gate.
                console.warn('[LOGIN] check-email unreachable (network/timeout) — continuing to Supabase auth:', emailCheckError);
            }

            // ── Supabase authentication ───────────────────────────────────────
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                // ISSUE C FIX: Classify the Supabase error accurately.
                setErrorMessage(classifySupabaseError(error));
                setIsLoading(false);
                return;
            }

            if (data?.session) {
                console.log('[AUDIT DEBUG] Login success');
                document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax`;

                let targetPath = '/';

                try {
                    const { data: profile } = await supabase
                        .from('profil_pengguna')
                        .select('role, nama_lengkap')
                        .eq('id', data.session.user.id)
                        .maybeSingle();

                    const role = normalizeRole(profile?.role);

                    // ═══════════════════════════════════════════════════════
                    // ROLE VALIDATION LAYER - Portal Dosen
                    // Only 'dosen' and 'admin' roles are allowed
                    // ═══════════════════════════════════════════════════════
                    if (role !== 'dosen' && role !== 'admin') {
                        await supabase.auth.signOut();
                        document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                        const sessionKey = `logged_${data.session.user.id}`;
                        if (typeof window !== 'undefined') {
                            sessionStorage.removeItem(sessionKey);
                        }
                        setErrorMessage('Akun ini tidak memiliki akses ke Portal Dosen.');
                        setIsLoading(false);
                        return;
                    }

                    // Role-based redirect destination
                    targetPath = role === 'admin' ? '/admin' : '/dosen';

                    // Session storage guard to prevent duplicate login logging
                    const sessionLoggedKey = `logged_${data.session.user.id}`;
                    if (typeof window !== 'undefined' && !sessionStorage.getItem(sessionLoggedKey)) {
                        console.log('[AUDIT DEBUG] About to write audit log');
                        sessionStorage.setItem(sessionLoggedKey, 'true');

                        const auditAction = role === 'admin' ? 'ADMIN_LOGIN' : 'LECTURER_LOGIN';
                        sendLoginAuditLog({
                            action: auditAction,
                            target: 'auth',
                            details: { role },
                        }, data.session.access_token);
                        console.log('[AUDIT DEBUG] Audit log request sent');
                    }
                } catch (auditErr) {
                    console.error('[AUDIT] Failed to log user login:', auditErr);
                }

                // ─────────────────────────────────────────────────────────────
                // ISSUE A FIX: Use router.push() instead of window.location.href
                //
                // BEFORE (broken):
                //   window.location.href = targetHref;
                //   → Hard browser reload → React unmounts entirely → AuthGate
                //     remounts with loading=true → cold auth restart → FullscreenLoader
                //     blocks UI for 5-6 seconds until checkAuth() completes.
                //
                // AFTER (fixed):
                //   router.push(targetPath);
                //   → Client-side navigation → React stays mounted → Supabase has
                //     already fired SIGNED_IN event → AuthGate already has user in
                //     state → no cold restart → immediate render.
                // ─────────────────────────────────────────────────────────────
                router.push(targetPath);
            }
        } catch (err) {
            // ISSUE C FIX: Top-level catch handles network/unknown errors accurately.
            setErrorMessage(classifyLoginError(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageTransition>
            <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] flex items-center justify-center px-4 pt-[calc(4.5rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))] font-sans relative overflow-hidden">
                {/* Elegant Background Glows */}
                <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                    <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-indigo-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                    <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-purple-500/12 rounded-full blur-[130px] animate-float-purple"></div>
                </div>

            {/* Top Navigation Bar with brand text only */}
            <motion.nav
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 md:px-10 lg:px-14 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-5"
            >
                <div className="flex items-center">
                    <span className="text-xs sm:text-sm font-bold tracking-wider select-none flex items-center gap-0">
                        <ShinyText
                            text="E-MATH"
                            color="#a3a3a3"
                            shineColor="#ffffff"
                            speed={3}
                            className="font-bold"
                        />
                        <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-bold">
                            TOCO
                        </span>
                    </span>
                </div>
            </motion.nav>

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-md glass-card rounded-2xl p-5 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 overflow-hidden"
            >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>

                {/* Back to role selection — navigates to /login?select=true */}
                <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    onClick={() => router.push('/login?select=true')}
                    className="flex items-center gap-1.5 text-neutral-500 hover:text-indigo-400 text-xs font-bold uppercase tracking-widest mb-4 sm:mb-6 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Kembali</span>
                </motion.button>

                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="text-center mb-8"
                >
                    <div className="mx-auto w-fit bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4 flex items-center justify-center">
                        <Image
                            src={Logo}
                            alt="Logo E-MATHTOCO"
                            className="h-10 w-auto object-contain"
                            priority
                        />
                    </div>

                    <div className="flex items-center justify-center gap-2 mb-2">
                        <BookOpen className="w-5 h-5 text-indigo-400" />
                        <h1 className="text-2xl font-extrabold tracking-wider text-white">
                            Masuk sebagai <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">Dosen</span>
                        </h1>
                    </div>
                    <div className="text-neutral-500 text-[10px] sm:text-xs uppercase tracking-widest mt-1">
                        <div>Kelola kelas dan lakukan review hasil penilaian</div>
                        <div className="min-h-[1.25rem] mt-0.5">
                            <TextType
                                text={['AI.', 'otomatis.', 'instan.']}
                                as="span"
                                typingSpeed={70}
                                deletingSpeed={40}
                                pauseDuration={1800}
                                className="text-indigo-400 font-semibold"
                                showCursor={true}
                                cursorCharacter="|"
                            />
                        </div>
                    </div>
                </motion.div>

                {errorMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mb-6 flex items-start gap-3 bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-sm"
                    >
                        <p className="font-medium leading-relaxed">{errorMessage}</p>
                    </motion.div>
                )}

                <motion.form
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                    onSubmit={handleLoginSubmit}
                    className="space-y-4 sm:space-y-5"
                >
                    <div>
                        <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1.5 sm:mb-2">Email</label>
                        <input
                            type="email"
                            placeholder="dosen@kampus.ac.id"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black border border-neutral-800 rounded-xl py-2.5 px-3.5 sm:py-3 sm:px-4 text-white focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/20 transition-all text-xs sm:text-sm placeholder:text-neutral-600"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1.5 sm:mb-2">
                            <label className="block text-[10px] sm:text-xs font-bold uppercase tracking-widest text-neutral-400">Password</label>
                        </div>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-black border border-neutral-800 rounded-xl py-2.5 pl-3.5 pr-11 sm:py-3 sm:pl-4 sm:pr-12 text-white focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/20 transition-all text-xs sm:text-sm placeholder:text-neutral-600"
                            />
                            <button
                                type="button"
                                onClick={togglePasswordVisibility}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 active:scale-95 transition-all p-1 rounded-lg hover:bg-neutral-900/50 cursor-pointer flex items-center justify-center"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                ) : (
                                    <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-600 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-700 text-white font-extrabold py-3 sm:py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/10 disabled:opacity-50 text-xs sm:text-sm tracking-widest cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    >
                        {isLoading ? <span>Memverifikasi Akun...</span> : <span>MASUK KE SISTEM</span>}
                    </button>
                </motion.form>
            </motion.div>
        </div>
        </PageTransition>
    );
}
