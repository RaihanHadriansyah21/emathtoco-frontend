'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { API_URL } from '@/lib/config';
import Image from 'next/image';
import Logo from '../../Emathtoco.png';
import { Eye, EyeOff, ArrowLeft, GraduationCap } from 'lucide-react';

export default function MahasiswaLoginPage() {
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
        detail: any;
        user_id: string;
        user_name: string;
        role: string;
    }) => {
        const url = `${API_URL}/audit/log`;
        const body = JSON.stringify(auditPayload);

        try {
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true',
                    'Accept': 'application/json',
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
            // Cek apakah email sudah terdaftar menggunakan backend API
            try {
                const checkUrl = `${API_URL}/auth/check-email?email=${encodeURIComponent(email)}`;
                const checkRes = await fetch(checkUrl, {
                    headers: {
                        'ngrok-skip-browser-warning': 'true',
                        'Accept': 'application/json',
                    }
                });
                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (checkData.exists === false) {
                        setErrorMessage('Email Anda belum terdaftar! Silakan lakukan pendaftaran akun terlebih dahulu.');
                        setIsLoading(false);
                        return;
                    }
                } else {
                    console.error("Gagal mendeteksi apakah email terdaftar, HTTP status:", checkRes.status);
                }
            } catch (emailCheckError) {
                console.error("Gagal mendeteksi apakah email terdaftar:", emailCheckError);
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                setErrorMessage('Email atau password salah! Silakan periksa kembali akun Anda.');
                setIsLoading(false);
                return;
            }

            if (data?.session) {
                console.log("[AUDIT DEBUG] Login success");
                document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${data.session.expires_in}; SameSite=Lax`;

                let targetHref = '/';

                try {
                    const { data: profile } = await supabase
                        .from('profil_pengguna')
                        .select('role, nama_lengkap')
                        .eq('id', data.session.user.id)
                        .maybeSingle();

                    const role = normalizeRole(profile?.role);
                    const userName = profile?.nama_lengkap || data.session.user.email || 'Anonymous';

                    // ═══════════════════════════════════════════════════════
                    // ROLE VALIDATION LAYER - Portal Mahasiswa
                    // Only 'mahasiswa' role is allowed through this portal
                    // ═══════════════════════════════════════════════════════
                    if (role !== 'mahasiswa') {
                        await supabase.auth.signOut();
                        document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                        const sessionKey = `logged_${data.session.user.id}`;
                        if (typeof window !== 'undefined') {
                            sessionStorage.removeItem(sessionKey);
                        }
                        setErrorMessage('Akun ini tidak memiliki akses ke Portal Mahasiswa.');
                        setIsLoading(false);
                        return;
                    }

                    // Session storage guard to prevent duplicate login logging
                    const sessionLoggedKey = `logged_${data.session.user.id}`;
                    if (typeof window !== 'undefined' && !sessionStorage.getItem(sessionLoggedKey)) {
                        console.log("[AUDIT DEBUG] About to write audit log");
                        sessionStorage.setItem(sessionLoggedKey, 'true');

                        const auditAction = 'STUDENT_LOGIN';
                        const auditTarget = 'profil_pengguna';

                        if (auditAction) {
                            sendLoginAuditLog({
                                action: auditAction,
                                target: auditTarget,
                                detail: { role },
                                user_id: data.session.user.id,
                                user_name: userName,
                                role: role,
                            });
                            console.log("[AUDIT DEBUG] Audit log request sent via sendBeacon");
                        }
                    }
                } catch (auditErr) {
                    console.error('[AUDIT] Failed to log user login:', auditErr);
                }

                window.location.href = targetHref;
            }
        } catch (err) {
            setErrorMessage('Terjadi gangguan jaringan pada sistem autentikasi.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] flex items-center justify-center px-4 font-sans relative overflow-hidden">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            <div className="w-full max-w-md bg-[#0A0A0F]/80 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

                {/* Back to role selection */}
                <button
                    onClick={() => router.push('/login')}
                    className="flex items-center gap-1.5 text-neutral-500 hover:text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Kembali</span>
                </button>

                <div className="text-center mb-8">
                    <div className="mx-auto w-fit bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-4 flex items-center justify-center">
                        <Image
                            src={Logo}
                            alt="Logo E-MATHTOCO"
                            className="h-10 w-auto object-contain"
                            priority
                        />
                    </div>

                    <div className="flex items-center justify-center gap-2 mb-2">
                        <GraduationCap className="w-5 h-5 text-cyan-400" />
                        <h1 className="text-2xl font-extrabold tracking-wider text-white">
                            Masuk sebagai <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">Mahasiswa</span>
                        </h1>
                    </div>
                    <p className="text-neutral-500 text-xs uppercase tracking-widest mt-1">Akses pengumpulan tugas dan hasil penilaian AI</p>
                </div>

                {errorMessage && (
                    <div className="mb-6 flex items-start gap-3 bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-sm">
                        <p className="font-medium leading-relaxed">{errorMessage}</p>
                    </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Email</label>
                        <input
                            type="email"
                            placeholder="nama@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400">Password</label>
                            <Link href="/forgot-password" className="text-xs font-bold text-cyan-400 hover:text-cyan-300 hover:underline transition-all">
                                Lupa Password?
                            </Link>
                        </div>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                            />
                            <button
                                type="button"
                                onClick={togglePasswordVisibility}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-350 active:scale-95 transition-all p-1 rounded-lg hover:bg-neutral-900/50 cursor-pointer flex items-center justify-center"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-4 h-4" />
                                ) : (
                                    <Eye className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest cursor-pointer"
                    >
                        {isLoading ? <span>Memverifikasi Akun...</span> : <span>MASUK KE SISTEM</span>}
                    </button>
                </form>

                {/* Link to register */}
                <div className="mt-6 text-center">
                    <p className="text-sm text-neutral-400">
                        Belum punya akun?{' '}
                        <Link href="/register" className="text-cyan-400 font-bold hover:text-cyan-300 hover:underline transition-all">
                            Buat Akun Baru
                        </Link>
                    </p>
                </div>

            </div>
        </div>
    );
}
