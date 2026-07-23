'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import Logo from '../Emathtoco.png';
import { ArrowLeft, UserPlus, Eye, EyeOff, Mail, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import PageTransition from '@/components/ui/PageTransition';
import { isStrongPassword, PASSWORD_REQUIREMENTS } from '@/lib/security/password';

export default function RegisterPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [registrationComplete, setRegistrationComplete] = useState(false);

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        // Validasi Form Dasar
        if (!email || !password || !confirmPassword) {
            setErrorMessage('Semua kolom wajib diisi!');
            return;
        }

        // FIX #9: Validate email format before sending to Supabase
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
            setErrorMessage('Format alamat email tidak valid!');
            return;
        }

        if (!isStrongPassword(password)) {
            setErrorMessage(`Password ${PASSWORD_REQUIREMENTS}.`);
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage('Konfirmasi password tidak cocok dengan password!');
            return;
        }

        setIsLoading(true);

        try {
            // Fungsi Sign Up bawaan Supabase
            // emailRedirectTo mengarahkan user ke /auth/callback setelah
            // klik link konfirmasi di email, yang kemudian menukar code
            // menjadi session dan redirect ke /complete-profile
            const { error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });

            if (error) {
                setErrorMessage(`Gagal mendaftar: ${error.message}`);
                setIsLoading(false);
                return;
            }

            // Berhasil Mendaftar — tampilkan pesan konfirmasi email
            // JANGAN redirect ke complete-profile karena belum ada session
            // (email confirmation aktif, user harus klik link di email dulu)
            setRegistrationComplete(true);
            setSuccessMessage(
                'Akun berhasil dibuat! Silakan cek kotak masuk email Anda dan klik link konfirmasi untuk melanjutkan.'
            );

        } catch {
            setErrorMessage('Terjadi kesalahan pada sistem pendaftaran.');
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

                    {/* Back to Login Selection */}
                    <motion.button
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.2 }}
                        onClick={() => router.push('/login')}
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
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <UserPlus className="w-5 h-5 text-cyan-400" />
                            <h1 className="text-2xl font-extrabold tracking-wider text-white">
                                Pendaftaran <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-extrabold">Akun</span>
                            </h1>
                        </div>
                        <p className="text-neutral-500 text-xs uppercase tracking-widest mt-1">Buat akun baru untuk mengakses E-MATHTOCO</p>
                    </motion.div>

                    {/* Peringatan Error */}
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

                    {registrationComplete ? (
                        /* ── Email Confirmation Success View ──────────── */
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="text-center space-y-5"
                        >
                            <div className="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center">
                                <Mail className="w-8 h-8 text-emerald-400" />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    <h2 className="text-lg font-bold text-emerald-400">Akun Berhasil Dibuat!</h2>
                                </div>
                                <p className="text-neutral-400 text-sm leading-relaxed">
                                    Kami telah mengirimkan email konfirmasi ke:
                                </p>
                                <p className="text-white font-semibold text-sm bg-white/5 border border-white/10 rounded-lg py-2 px-4 inline-block">
                                    {email}
                                </p>
                            </div>

                            <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 text-left space-y-2">
                                <p className="text-cyan-400 text-xs font-bold uppercase tracking-wider">Langkah Selanjutnya:</p>
                                <ol className="text-neutral-400 text-xs space-y-1.5 list-decimal list-inside leading-relaxed">
                                    <li>Buka kotak masuk email Anda</li>
                                    <li>Klik link konfirmasi dari <span className="text-white font-medium">E-MATHTOCO</span></li>
                                    <li>Anda akan langsung diarahkan ke pengisian data diri</li>
                                </ol>
                            </div>

                            <p className="text-neutral-600 text-[11px]">
                                Tidak menerima email? Periksa folder spam atau coba daftar ulang.
                            </p>

                            <Link
                                href="/login"
                                className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 text-xs font-bold uppercase tracking-widest transition-colors"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                Kembali ke Login
                            </Link>
                        </motion.div>
                    ) : (
                        /* ── Registration Form ──────────────────────── */
                        <>
                            <motion.form
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.25 }}
                                onSubmit={handleRegisterSubmit}
                                className="space-y-4"
                            >
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
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Password Baru</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Min. 6 Karakter Alfanumerik"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
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
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Konfirmasi Password</label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Ulangi Password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
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
                                    className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest mt-4 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    {isLoading ? <span>Memproses...</span> : <span>DAFTARKAN AKUN</span>}
                                </button>
                            </motion.form>

                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.4, delay: 0.35 }}
                                className="mt-6 text-center"
                            >
                                <p className="text-sm text-neutral-400">
                                    Sudah punya akun?{' '}
                                    <Link href="/login" className="text-cyan-400 font-bold hover:text-cyan-300 hover:underline transition-all">
                                        Kembali ke Login
                                    </Link>
                                </p>
                            </motion.div>
                        </>
                    )}

                </motion.div>
            </div>
        </PageTransition>
    );
}
