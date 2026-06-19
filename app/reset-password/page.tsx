'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import Logo from '../Emathtoco.png';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

const getErrorFromURL = () => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash;
    const search = window.location.search;
    
    const hashParams = new URLSearchParams(hash.substring(1));
    const searchParams = new URLSearchParams(search);
    
    const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
    if (errorDesc) {
        return decodeURIComponent(errorDesc.replace(/\+/g, ' '));
    }
    
    const errorMsg = hashParams.get('error') || searchParams.get('error');
    if (errorMsg) {
        return `Kesalahan Pemulihan: ${decodeURIComponent(errorMsg.replace(/\+/g, ' '))}`;
    }
    
    return null;
};

export default function ResetPasswordPage() {
    const router = useRouter();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [isChecking, setIsChecking] = useState(true);
    const [hasSession, setHasSession] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        let isSubscribed = true;

        const verifyRecoverySession = async () => {
            try {
                // Debug log
                console.log("RECOVERY URL:", window.location.href);
                console.log("CURRENT PATH:", window.location.pathname);

                // Check for errors in the URL redirect first (e.g. invalid/expired recovery links)
                const urlError = getErrorFromURL();
                if (urlError) {
                    console.log("Detected error in recovery URL params:", urlError);
                    if (isSubscribed) {
                        setErrorMessage(urlError);
                        setIsChecking(false);
                    }
                    return;
                }

                // 1. Initial check (if session is already established on mount)
                const { data: { session } } = await supabase.auth.getSession();
                console.log("INITIAL SESSION CHECK:", session);
                
                if (session) {
                    if (isSubscribed) {
                        setHasSession(true);
                        setIsChecking(false);
                    }
                    return;
                }

                // 2. Poll for session if we are in recovery flow based on URL structure
                const hash = window.location.hash;
                const search = window.location.search;
                const isRecoveryFlow = hash.includes('type=recovery') || hash.includes('access_token=') || search.includes('type=recovery');

                if (isRecoveryFlow) {
                    console.log("Recovery URL parameters detected. Polling for session initialization...");
                    
                    // Poll getSession up to 3 seconds (30 attempts * 100ms)
                    for (let i = 0; i < 30; i++) {
                        await new Promise((resolve) => setTimeout(resolve, 100));
                        if (!isSubscribed) return;

                        const { data: { session: polledSession } } = await supabase.auth.getSession();
                        if (polledSession) {
                            console.log("Session resolved via polling:", polledSession);
                            if (isSubscribed) {
                                setHasSession(true);
                                setIsChecking(false);
                            }
                            return;
                        }
                    }
                }

                // If still no session after check/polling
                if (isSubscribed) {
                    setErrorMessage('Tautan reset password kedaluwarsa atau sesi pemulihan tidak ditemukan. Silakan ajukan lupa password kembali.');
                    setIsChecking(false);
                }
            } catch (err) {
                console.error("Error in verifyRecoverySession:", err);
                if (isSubscribed) {
                    setErrorMessage('Terjadi gangguan saat memvalidasi sesi pemulihan.');
                    setIsChecking(false);
                }
            }
        };

        verifyRecoverySession();

        // Listen for auth event changes to update page state dynamically
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log("AUTH EVENT:", event);
            console.log("SESSION:", session);
            console.log("CURRENT PATH:", window.location.pathname);
            console.log("RECOVERY URL:", window.location.href);

            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
                if (isSubscribed) {
                    setHasSession(true);
                    setIsChecking(false);
                }
            }
        });

        return () => {
            isSubscribed = false;
            subscription.unsubscribe();
        };
    }, []);

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!newPassword || !confirmPassword) {
            setErrorMessage('Wajib melampirkan password baru dan konfirmasi!');
            return;
        }

        const alnumRegex = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;
        if (!alnumRegex.test(newPassword)) {
            setErrorMessage('Password baru harus minimal 6 karakter dan mengandung kombinasi huruf dan angka (alfanumerik)!');
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('Konfirmasi password tidak cocok dengan password baru!');
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) {
                setErrorMessage(error.message || 'Gagal mengubah password. Silakan coba kembali.');
                setIsLoading(false);
                return;
            }

            setSuccessMessage('Password Anda berhasil diperbarui! Mengalihkan ke halaman login...');
            
            // Clean up session cookies and sign out to force fresh login
            setTimeout(async () => {
                try {
                    await supabase.auth.signOut();
                } catch (err) {
                    console.error("Error signing out:", err);
                }
                document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                router.push('/login');
            }, 3000);
        } catch (err) {
            setErrorMessage('Terjadi kesalahan pada sistem. Silakan coba kembali.');
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

            {/* Top Navigation Bar with brand text only */}
            <motion.nav
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 sm:px-10 lg:px-14 py-5"
            >
                <div className="flex items-center">
                    <span className="text-white text-sm font-bold tracking-wider">
                        E-MATH<span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-bold">TOCO</span>
                    </span>
                </div>
            </motion.nav>

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-md bg-[#0A0A0F]/80 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 overflow-hidden"
            >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

                {/* Back Button */}
                <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    onClick={() => window.location.href = '/login'}
                    className="flex items-center gap-1.5 text-neutral-500 hover:text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6 transition-colors cursor-pointer"
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
                    <h1 className="text-2xl font-extrabold tracking-wider text-white">
                        E-MATH<span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-extrabold">TOCO</span>
                    </h1>
                    <p className="text-neutral-500 text-xs uppercase tracking-widest mt-2">Atur Ulang Kata Sandi Akun</p>
                </motion.div>

                {isChecking ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" />
                        <p className="text-neutral-400 text-xs animate-pulse">Memverifikasi sesi pemulihan...</p>
                    </div>
                ) : (
                    <>
                        {errorMessage && !hasSession && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                                className="mb-6 flex flex-col items-center gap-3 bg-red-950/20 border border-red-900/50 text-red-400 p-6 rounded-xl text-center text-sm"
                            >
                                <AlertTriangle className="w-8 h-8 text-red-500 mb-1" />
                                <p className="font-semibold leading-relaxed">{errorMessage}</p>
                                <Link href="/forgot-password" className="mt-4 px-4 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-white rounded-xl font-bold text-xs tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98]">
                                    MOHON TAUTAN BARU
                                </Link>
                            </motion.div>
                        )}

                        {errorMessage && hasSession && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                                className="mb-6 flex items-start gap-3 bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-sm"
                            >
                                <p className="font-medium leading-relaxed">{errorMessage}</p>
                            </motion.div>
                        )}

                        {successMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3 }}
                                className="mb-6 flex items-start gap-3 bg-emerald-950/20 border border-emerald-900/50 text-emerald-400 p-4 rounded-xl text-sm"
                            >
                                <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                                <p className="font-medium leading-relaxed">{successMessage}</p>
                            </motion.div>
                        )}

                        {hasSession && !successMessage && (
                            <motion.form
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.25 }}
                                onSubmit={handleResetSubmit}
                                className="space-y-5"
                            >
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Password Baru (min. 6 karakter alfanumerik)</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                                            disabled={isLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 active:scale-95 transition-all p-1 rounded-lg hover:bg-neutral-900/50 cursor-pointer flex items-center justify-center"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Konfirmasi Password Baru</label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="••••••••"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                                            disabled={isLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 active:scale-95 transition-all p-1 rounded-lg hover:bg-neutral-900/50 cursor-pointer flex items-center justify-center"
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Memperbarui Password...</span>
                                        </>
                                    ) : (
                                        <span>PERBARUI PASSWORD</span>
                                    )}
                                </button>
                            </motion.form>
                        )}

                        {(!hasSession || successMessage) && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.4, delay: 0.35 }}
                                className="mt-6 text-center border-t border-neutral-800/80 pt-6"
                            >
                                <Link href="/login" className="inline-flex items-center gap-2 text-sm text-neutral-400 font-bold hover:text-cyan-400 transition-all">
                                    Kembali ke Login
                                </Link>
                            </motion.div>
                        )}
                    </>
                )}
            </motion.div>
        </div>
    );
}
