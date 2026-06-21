'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import Logo from '../Emathtoco.png';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import PageTransition from '@/components/ui/PageTransition';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        const emailTrimmed = email.trim();
        if (!emailTrimmed) {
            setErrorMessage('Wajib memasukkan alamat email Anda!');
            return;
        }

        // Basic email validation regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailTrimmed)) {
            setErrorMessage('Format alamat email tidak valid!');
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(emailTrimmed, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (error) {
                setErrorMessage(error.message || 'Gagal mengirim link reset password. Silakan periksa kembali email Anda.');
                return;
            }

            setSuccessMessage('Tautan reset password telah dikirim ke email Anda. Silakan periksa kotak masuk atau spam email Anda.');
            setEmail('');
        } catch (err) {
            setErrorMessage('Terjadi gangguan koneksi pada sistem. Silakan coba sesaat lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <PageTransition>
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
                        <p className="text-neutral-500 text-xs uppercase tracking-widest mt-2">Lupa Kata Sandi Akun Anda?</p>
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

                    <motion.form
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.25 }}
                        onSubmit={handleForgotPasswordSubmit}
                        className="space-y-5"
                    >
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Alamat Email Terdaftar</label>
                            <div className="relative">
                                <input
                                    type="email"
                                    placeholder="nama@gmail.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                                    disabled={isLoading}
                                />
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 w-4 h-4" />
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
                                    <span>Mengirim Tautan...</span>
                                </>
                            ) : (
                                <span>KIRIM TAUTAN RESET</span>
                            )}
                        </button>
                    </motion.form>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.35 }}
                        className="mt-6 text-center border-t border-neutral-800/80 pt-6"
                    >
                        <Link href="/login" className="inline-flex items-center gap-2 text-sm text-neutral-400 font-bold hover:text-cyan-400 transition-all">
                            <ArrowLeft className="w-4 h-4" />
                            Kembali ke Login
                        </Link>
                    </motion.div>
                </motion.div>
            </div>
        </PageTransition>
    );
}
