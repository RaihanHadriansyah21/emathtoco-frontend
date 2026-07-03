'use client';

import React, { useState, useEffect } from 'react';
import { KeyRound, MonitorDot, Info, Eye, EyeOff, Loader2, CheckCircle2, Sun, Moon } from 'lucide-react';
import { useAuth } from '../components/AuthGate';
import Navbar from '../components/Navbar';
import { supabase } from '@/lib/supabase';
import { useTheme } from 'next-themes';
import PageTransition from '@/components/ui/PageTransition';
import { isStrongPassword, PASSWORD_REQUIREMENTS } from '@/lib/security/password';

export default function SettingsPage() {
    const { user, loading } = useAuth();
    const [userEmail, setUserEmail] = useState('');
    const [role, setRole] = useState('mahasiswa');
    const [isChecking, setIsChecking] = useState(true);

    // Password form states
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (loading) return;
        if (user) {
            setUserEmail(user.email);
            setRole(user.role);
        }
        setIsChecking(false);
    }, [user, loading]);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!currentPassword || !newPassword || !confirmPassword) {
            setErrorMessage('Seluruh kolom kata sandi wajib diisi!');
            return;
        }

        if (!isStrongPassword(newPassword)) {
            setErrorMessage(`Kata sandi baru ${PASSWORD_REQUIREMENTS}.`);
            return;
        }

        if (newPassword !== confirmPassword) {
            setErrorMessage('Konfirmasi kata sandi baru tidak cocok!');
            return;
        }

        setIsLoading(true);

        try {
            // Langkah 1: Autentikasi ulang kata sandi saat ini untuk keamanan
            const { error: reauthError } = await supabase.auth.signInWithPassword({
                email: userEmail,
                password: currentPassword
            });

            if (reauthError) {
                setErrorMessage('Kata sandi saat ini salah! Silakan periksa kembali.');
                setIsLoading(false);
                return;
            }

            // Langkah 2: Perbarui kata sandi di Supabase Auth
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (updateError) {
                setErrorMessage(`Gagal memperbarui kata sandi: ${updateError.message}`);
                setIsLoading(false);
                return;
            }

            setSuccessMessage('Kata sandi berhasil diperbarui!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch {
            setErrorMessage('Terjadi kesalahan koneksi server.');
        } finally {
            setIsLoading(false);
        }
    };

    const themeOptions = [
        { value: 'light', label: 'Light Mode', icon: Sun, desc: 'Terang & bersih' },
        { value: 'dark', label: 'Dark Mode', icon: Moon, desc: 'Gelap futuristik' },
        { value: 'system', label: 'System Mode', icon: MonitorDot, desc: 'Ikuti perangkat' }
    ];

    if (isChecking) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
                    <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memuat pengaturan...</p>
                </div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] dark:text-neutral-300 font-sans pb-12 relative overflow-hidden">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            {/* HEADER NAVBAR */}
            <Navbar 
                showBack 
                backUrl={role === 'admin' ? '/admin' : role === 'dosen' ? '/dosen' : '/'} 
                title="Pengaturan" 
            />

            <main className="max-w-xl mx-auto px-4 py-12 relative z-10 space-y-8">

                {/* 1. SECTION: UBAH PASSWORD */}
                <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F]/80 dark:border-neutral-800/80 backdrop-blur-md rounded-2xl p-8 shadow-sm dark:shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                    <div className="flex items-center gap-3 border-b border-slate-100 dark:border-neutral-900 pb-4 mb-6">
                        <KeyRound className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">Ubah Kata Sandi</h2>
                    </div>

                    {errorMessage && (
                        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-650 p-4 rounded-xl text-sm animate-in fade-in duration-200 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-400">
                            <p className="font-medium leading-relaxed">{errorMessage}</p>
                        </div>
                    )}
                    {successMessage && (
                        <div className="mb-6 flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-600 p-4 rounded-xl text-sm animate-in fade-in duration-200 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 dark:text-emerald-400" />
                            <p className="font-medium leading-relaxed">{successMessage}</p>
                        </div>
                    )}

                    <form onSubmit={handlePasswordChange} className="space-y-5">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">Kata Sandi Saat Ini</label>
                            <div className="relative">
                                <input
                                    type={showCurrent ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-11 text-slate-900 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-slate-400 dark:bg-black dark:border-neutral-800 dark:text-white dark:placeholder:text-neutral-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent(!showCurrent)}
                                    className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
                                >
                                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">Kata Sandi Baru</label>
                            <div className="relative">
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-11 text-slate-900 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-slate-400 dark:bg-black dark:border-neutral-800 dark:text-white dark:placeholder:text-neutral-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew(!showNew)}
                                    className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
                                >
                                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">Konfirmasi Kata Sandi Baru</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-11 text-slate-900 focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-slate-400 dark:bg-black dark:border-neutral-800 dark:text-white dark:placeholder:text-neutral-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-4 top-3 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
                                >
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest mt-2 cursor-pointer flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>MEMPROSES...</span>
                                </>
                            ) : (
                                <span>PERBARUI KATA SANDI</span>
                            )}
                        </button>
                    </form>
                </div>

                {/* 2. SECTION: TAMPILAN */}
                <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F]/80 dark:border-neutral-800/80 backdrop-blur-md rounded-2xl p-8 shadow-sm dark:shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                    <div className="flex items-center gap-3 border-b border-slate-100 dark:border-neutral-900 pb-4 mb-5">
                        <MonitorDot className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">Tampilan</h2>
                    </div>
                    <div className="flex flex-col gap-4">
                        <span className="text-slate-600 dark:text-neutral-400 text-sm font-medium">Pilih Tema Aplikasi</span>
                        {mounted ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {themeOptions.map((opt) => {
                                    const Icon = opt.icon;
                                    const isActive = theme === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setTheme(opt.value)}
                                            className={`flex flex-col items-center justify-center p-4 rounded-xl border text-center transition-all duration-300 cursor-pointer ${
                                                isActive
                                                    ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500 text-cyan-600 dark:text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-black/40 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700'
                                            }`}
                                        >
                                            <Icon className={`w-5 h-5 mb-2 ${isActive ? 'text-cyan-500 dark:text-cyan-400' : 'text-slate-400 dark:text-neutral-500'}`} />
                                            <span className="text-xs font-bold block mb-1">{opt.label}</span>
                                            <span className="text-[9px] text-slate-400 dark:text-neutral-500 block leading-tight">{opt.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="h-24 bg-slate-100 dark:bg-neutral-950/40 rounded-xl animate-pulse" />
                        )}
                    </div>
                </div>

                {/* 3. SECTION: TENTANG APLIKASI */}
                <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F]/80 dark:border-neutral-800/80 backdrop-blur-md rounded-2xl p-8 shadow-sm dark:shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                    <div className="flex items-center gap-3 border-b border-slate-100 dark:border-neutral-900 pb-4 mb-5">
                        <Info className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">Tentang Aplikasi</h2>
                    </div>
                    <div className="space-y-4 text-sm text-slate-600 dark:text-neutral-400">
                        <div className="flex justify-between">
                            <span className="font-medium text-slate-600 dark:text-neutral-300">Nama Aplikasi</span>
                            <span className="font-semibold text-slate-900 dark:text-white">E-MATHTOCO</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-medium text-slate-600 dark:text-neutral-300">Versi Sistem</span>
                            <span className="font-mono text-slate-900 dark:text-white text-xs">v1.0.0</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-neutral-500 leading-relaxed border-t border-slate-100 dark:border-neutral-900 pt-4">
                            E-MATHTOCO (Essay Mathematics Auto Correction) adalah platform penilaian terotomatisasi yang dikembangkan untuk mendukung pengumpulan & evaluasi digital lembar jawaban tugas kuliah mahasiswa secara dinamis, cepat, dan aman.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    </PageTransition>
  );
}
