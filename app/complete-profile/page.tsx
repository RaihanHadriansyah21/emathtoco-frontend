'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { User, IdCard, GraduationCap, Loader2 } from 'lucide-react';

export default function CompleteProfilePage() {
    const router = useRouter();
    const [namaLengkap, setNamaLengkap] = useState('');
    const [nimNip, setNimNip] = useState('');
    const [kelas, setKelas] = useState('');

    const [userId, setUserId] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        // Ambil data user aktif
        const checkExistingProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    await supabase.auth.signOut();
                    document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                    window.location.href = '/login';
                    return;
                }
                setUserId(user.id);

                // Cek apakah data profil sudah ada di database
                const { data: profile, error } = await supabase
                    .from('profil_pengguna')
                    .select('nama_lengkap, role')
                    .eq('id', user.id)
                    .maybeSingle();

                console.log("AUTH USER:", user);
                console.log("PROFILE:", profile);
                console.log("PROFILE ERROR:", error);

                if (error) {
                    console.error("Gagal memeriksa profil terdaftar:", error);
                    setErrorMessage("Gagal memeriksa data profil dari database.");
                    setIsChecking(false);
                    return;
                }

                if (profile) {
                    // Jika profil sudah lengkap, arahkan langsung ke dashboard yang sesuai
                    const userRole = normalizeRole(profile.role || 'mahasiswa');
                    if (userRole === 'dosen') {
                        router.push('/dosen');
                    } else if (userRole === 'admin') {
                        router.push('/admin');
                    } else {
                        router.push('/');
                    }
                    return;
                }
            } catch (err) {
                console.error('Gagal memverifikasi data profil:', err);
                await supabase.auth.signOut();
                document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
                window.location.href = '/login';
            } finally {
                setIsChecking(false);
            }
        };

        checkExistingProfile();
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!namaLengkap.trim() || !nimNip.trim() || !kelas.trim()) {
            setErrorMessage('Seluruh kolom wajib diisi!');
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
                    kelas: kelas.trim()
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
        <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] flex items-center justify-center px-4 font-sans relative overflow-hidden">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            <div className="w-full max-w-md bg-[#0A0A0F]/80 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] relative z-10 overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

                <div className="text-center mb-8">
                    <div className="mx-auto w-16 h-16 bg-black border border-neutral-800 rounded-2xl flex items-center justify-center shadow-inner mb-4">
                        <GraduationCap className="w-8 h-8 text-cyan-400" />
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-wider text-white">
                        Lengkapi <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 bg-clip-text text-transparent font-extrabold">Profil</span>
                    </h1>
                    <p className="text-neutral-400 text-xs uppercase tracking-widest mt-2">Satu langkah lagi sebelum masuk ke sistem</p>
                </div>

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

                <form onSubmit={handleSubmit} className="space-y-5">
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
                                placeholder="Masukkan NIM Anda"
                                value={nimNip}
                                onChange={(e) => setNimNip(e.target.value)}
                                className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                            />
                            <IdCard className="absolute left-4 top-3.5 w-4 h-4 text-neutral-500" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">Kelas</label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="IF-44-01"
                                value={kelas}
                                onChange={(e) => setKelas(e.target.value)}
                                className="w-full bg-black border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20 transition-all text-sm placeholder:text-neutral-600"
                            />
                            <GraduationCap className="absolute left-4 top-3.5 w-4 h-4 text-neutral-500" />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest mt-4 cursor-pointer"
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
                </form>
            </div>
        </div>
    );
}
