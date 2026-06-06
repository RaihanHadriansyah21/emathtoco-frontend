'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function RegisterPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        // Validasi Form Dasar
        if (!email || !password || !confirmPassword) {
            setErrorMessage('Semua kolom wajib diisi!');
            return;
        }

        if (password.length < 6) {
            setErrorMessage('Password minimal harus 6 karakter.');
            return;
        }

        if (password !== confirmPassword) {
            setErrorMessage('Konfirmasi password tidak cocok dengan password!');
            return;
        }

        setIsLoading(true);

        try {
            // Fungsi Sign Up bawaan Supabase
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
            });

            if (error) {
                setErrorMessage(`Gagal mendaftar: ${error.message}`);
                setIsLoading(false);
                return;
            }

            // Berhasil Mendaftar
            setSuccessMessage('Akun berhasil dibuat! Mengalihkan ke halaman login...');

            // Jeda 2 detik agar user sempat membaca pesan sukses sebelum dipindah
            setTimeout(() => {
                router.push('/login');
            }, 2000);

        } catch (err) {
            setErrorMessage('Terjadi kesalahan pada sistem pendaftaran.');
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

            <div className="w-full max-w-md bg-[#0A0A0F]/80 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold tracking-wider text-white">
                        Pendaftaran <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 bg-clip-text text-transparent font-extrabold">Akun</span>
                    </h1>
                    <p className="text-neutral-400 text-xs uppercase tracking-widest mt-2">Buat akun baru untuk mengakses EMATHTOCO</p>
                </div>

                {/* Peringatan Error & Sukses */}
                {errorMessage && (
                    <div className="mb-6 flex items-start gap-3 bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-sm">
                        <p className="font-medium leading-relaxed">{errorMessage}</p>
                    </div>
                )}
                {successMessage && (
                    <div className="mb-6 flex items-start gap-3 bg-emerald-950/20 border border-emerald-900/50 text-emerald-400 p-4 rounded-xl text-sm">
                        <p className="font-medium leading-relaxed">{successMessage}</p>
                    </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
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
                        <input
                            type="password"
                            placeholder="Minimal 6 Karakter"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Konfirmasi Password</label>
                        <input
                            type="password"
                            placeholder="Ulangi Password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full bg-black border border-neutral-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest mt-4 cursor-pointer"
                    >
                        {isLoading ? <span>Memproses...</span> : <span>DAFTARKAN AKUN</span>}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-sm text-neutral-400">
                        Sudah punya akun?{' '}
                        <Link href="/login" className="text-cyan-400 font-bold hover:text-cyan-300 hover:underline transition-all">
                            Kembali ke Login
                        </Link>
                    </p>
                </div>

            </div>
        </div>
    );
}