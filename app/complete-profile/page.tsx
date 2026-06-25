'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/components/AuthGate';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { User, IdCard, GraduationCap, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import PageTransition from '@/components/ui/PageTransition';

export default function CompleteProfilePage() {
    const router = useRouter();
    const routerRef = useRef(router);
    routerRef.current = router;

    // FIX #3: Use useAuth() as single source of truth instead of
    // calling supabase.auth.getUser() independently (which caused deadlocks)
    const { user: authUser, loading: authLoading } = useAuth();

    const [namaLengkap, setNamaLengkap] = useState('');
    const [nimNip, setNimNip] = useState('');
    const [kelas, setKelas] = useState('');

    const [userId, setUserId] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        // Wait for AuthGate to finish loading
        if (authLoading) return;

        // If no authenticated user, redirect to login
        if (!authUser) {
            window.location.href = '/login';
            return;
        }

        setUserId(authUser.id);

        // Check if profile already exists in database
        const checkExistingProfile = async () => {
            try {
                const { data: profile, error } = await supabase
                    .from('profil_pengguna')
                    .select('nama_lengkap, role')
                    .eq('id', authUser.id)
                    .maybeSingle();

                if (error) {
                    setErrorMessage("Gagal memeriksa data profil dari database.");
                    setIsChecking(false);
                    return;
                }

                if (profile) {
                    // Jika profil sudah lengkap, arahkan langsung ke dashboard yang sesuai
                    const userRole = normalizeRole(profile.role || 'mahasiswa');
                    if (userRole === 'dosen') {
                        routerRef.current.push('/dosen');
                    } else if (userRole === 'admin') {
                        routerRef.current.push('/admin');
                    } else {
                        routerRef.current.push('/');
                    }
                    return;
                }
            } catch (err) {
                // Network/unexpected error — redirect to login
                window.location.href = '/login';
            } finally {
                setIsChecking(false);
            }
        };

        checkExistingProfile();
    // FIX #10: authUser and authLoading are stable references from context,
    // no need for router in deps (use routerRef instead)
    }, [authUser, authLoading]);

    // Regex patterns for validation
    const NIM_PATTERN = /^\d{8,}$/;
    const KELAS_PATTERN = /^[A-Z]{2,3}-\d{2}-\d{2}$/;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!namaLengkap.trim() || !nimNip.trim() || !kelas.trim()) {
            setErrorMessage('Seluruh kolom wajib diisi!');
            return;
        }

        // Validate NIM: must be digits only, minimum 8 characters
        if (!NIM_PATTERN.test(nimNip.trim())) {
            setErrorMessage('Format NIM tidak valid. NIM harus berupa angka minimal 8 digit.');
            return;
        }

        // Validate Kelas: must match XX-00-00 format (2-3 uppercase letters, dash, 2 digits, dash, 2 digits)
        if (!KELAS_PATTERN.test(kelas.trim().toUpperCase())) {
            setErrorMessage('Format Kelas tidak valid. Gunakan format seperti: TT-46-01 (2-3 huruf kapital, strip, angka, strip, angka).');
            return;
        }

        if (!userId) {
            setErrorMessage('Sesi pengguna tidak valid. Silakan masuk kembali.');
            return;
        }

        setIsLoading(true);

        try {
            // Lakukan insert data baru ke tabel profil_pengguna dengan UUID authenticated user
            const { error } = await supabase
                .from('profil_pengguna')
                .insert({
                    id: userId,
                    role: 'mahasiswa',
                    nama_lengkap: namaLengkap.trim(),
                    nim_nip: nimNip.trim(),
                    kelas: kelas.trim().toUpperCase()
                });

            if (error) {
                // Periksa apakah ini duplicate key error
                if (error.code === '23505') {
                    setErrorMessage('Profil untuk akun ini sudah terdaftar!');
                } else {
                    setErrorMessage(`Gagal menyimpan profil: ${error.message}`);
                }
                setIsLoading(false);
                return;
            }

            setSuccessMessage('Profil Anda berhasil dilengkapi! Mengalihkan ke halaman utama...');

            // Redirect setelah jeda agar notifikasi terbaca
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);

        } catch (err) {
            setErrorMessage('Terjadi gangguan jaringan saat menghubungi server database.');
            setIsLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] flex items-center justify-center font-sans">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                    <p className="text-neutral-400 text-sm animate-pulse">Memverifikasi status akun Anda...</p>
                </div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] flex items-center justify-center px-4 font-sans relative overflow-hidden">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-md bg-[#0A0A0F]/80 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 overflow-hidden"
            >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="text-center mb-8"
                >
                    <div className="mx-auto w-16 h-16 bg-black border border-neutral-800 rounded-2xl flex items-center justify-center shadow-inner mb-4">
                        <GraduationCap className="w-8 h-8 text-cyan-400" />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-wider text-white">
                        Lengkapi <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 bg-clip-text text-transparent font-extrabold">Profil</span>
                    </h1>
                    <p className="text-neutral-400 text-xs uppercase tracking-widest mt-2">Satu langkah lagi sebelum masuk ke sistem</p>
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
                        <p className="font-medium leading-relaxed">{successMessage}</p>
                    </motion.div>
                )}

                <motion.form
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.25 }}
                    onSubmit={handleSubmit}
                    className="space-y-5"
                >
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Nama Lengkap</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Masukkan nama lengkap Anda"
                                value={namaLengkap}
                                onChange={(e) => setNamaLengkap(e.target.value)}
                                className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                            />
                            <User className="absolute left-4 top-3.5 w-4 h-4 text-neutral-500" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Nomor Induk Mahasiswa (NIM)</label>
                        <div className="relative">
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="Contoh: 1234567890"
                                value={nimNip}
                                onChange={(e) => {
                                    // Only allow digits
                                    const val = e.target.value.replace(/\D/g, '');
                                    setNimNip(val);
                                }}
                                className={`w-full bg-black border rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-1 transition-all text-sm placeholder:text-neutral-600 ${
                                    nimNip.length > 0 && !NIM_PATTERN.test(nimNip)
                                        ? 'border-amber-500/60 focus:border-amber-500/80 focus:ring-amber-500/20'
                                        : nimNip.length >= 8
                                            ? 'border-emerald-500/40 focus:border-emerald-500/80 focus:ring-emerald-500/20'
                                            : 'border-neutral-800 focus:border-cyan-500/80 focus:ring-cyan-500/20'
                                }`}
                            />
                            <IdCard className="absolute left-4 top-3.5 w-4 h-4 text-neutral-500" />
                        </div>
                        {nimNip.length > 0 && nimNip.length < 8 && (
                            <p className="text-[11px] text-amber-400/80 mt-1.5 ml-1">Minimal 8 digit angka ({nimNip.length}/8)</p>
                        )}
                        {nimNip.length >= 8 && (
                            <p className="text-[11px] text-emerald-400/80 mt-1.5 ml-1">✓ Format NIM valid</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Kelas</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Contoh: TT-46-01"
                                value={kelas}
                                onChange={(e) => {
                                    // Auto-uppercase and limit to valid characters
                                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                                    setKelas(val);
                                }}
                                maxLength={9}
                                className={`w-full bg-black border rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:ring-1 transition-all text-sm placeholder:text-neutral-600 uppercase ${
                                    kelas.length > 0 && !KELAS_PATTERN.test(kelas)
                                        ? 'border-amber-500/60 focus:border-amber-500/80 focus:ring-amber-500/20'
                                        : KELAS_PATTERN.test(kelas)
                                            ? 'border-emerald-500/40 focus:border-emerald-500/80 focus:ring-emerald-500/20'
                                            : 'border-neutral-800 focus:border-cyan-500/80 focus:ring-cyan-500/20'
                                }`}
                            />
                            <GraduationCap className="absolute left-4 top-3.5 w-4 h-4 text-neutral-500" />
                        </div>
                        {kelas.length > 0 && !KELAS_PATTERN.test(kelas) && (
                            <p className="text-[11px] text-amber-400/80 mt-1.5 ml-1">Format: 2-3 huruf kapital, strip, angka, strip, angka (cth: TT-46-01)</p>
                        )}
                        {KELAS_PATTERN.test(kelas) && (
                            <p className="text-[11px] text-emerald-400/80 mt-1.5 ml-1">✓ Format Kelas valid</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest mt-4 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Menyimpan Profil...</span>
                            </>
                        ) : (
                            <span>SELESAIKAN PROFIL</span>
                        )}
                    </button>
                </motion.form>
            </motion.div>
        </div>
    </PageTransition>
  );
}
