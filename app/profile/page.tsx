'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, IdCard, GraduationCap, Edit3, Save, X, Loader2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '@/lib/supabase';

const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
};

export default function ProfilePage() {
    const router = useRouter();
    const [userId, setUserId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('mahasiswa');
    
    // Form fields state
    const [namaLengkap, setNamaLengkap] = useState('');
    const [nimNip, setNimNip] = useState('');
    const [kelas, setKelas] = useState('');

    // Original copies to discard edits
    const [origNama, setOrigNama] = useState('');
    const [origNim, setOrigNim] = useState('');
    const [origKelas, setOrigKelas] = useState('');

    const [isChecking, setIsChecking] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    window.location.href = '/login';
                    return;
                }
                setUserId(user.id);
                setEmail(user.email || '');

                const { data: profile } = await supabase
                    .from('profil_pengguna')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                if (profile) {
                    setNamaLengkap(profile.nama_lengkap || '');
                    setNimNip(profile.nim_nip || '');
                    setKelas(profile.kelas || '');
                    setRole(profile.role || 'mahasiswa');

                    setOrigNama(profile.nama_lengkap || '');
                    setOrigNim(profile.nim_nip || '');
                    setOrigKelas(profile.kelas || '');
                } else {
                    // Profile not filled yet! Force onboarding redirection
                    router.push('/complete-profile');
                }
            } catch (err) {
                console.error('Gagal mengambil data profil:', err);
                setErrorMessage('Terjadi kesalahan memuat profil Anda.');
            } finally {
                setIsChecking(false);
            }
        };

        fetchUserProfile();
    }, [router]);

    const handleCancel = () => {
        setNamaLengkap(origNama);
        setNimNip(origNim);
        setKelas(origKelas);
        setIsEditing(false);
        setErrorMessage(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setSuccessMessage(null);

        if (!namaLengkap.trim() || !nimNip.trim() || !kelas.trim()) {
            setErrorMessage('Seluruh kolom wajib diisi!');
            return;
        }

        if (!userId) return;

        setIsLoading(true);

        try {
            const { error } = await supabase
                .from('profil_pengguna')
                .update({
                    nama_lengkap: namaLengkap.trim(),
                    nim_nip: nimNip.trim(),
                    kelas: kelas.trim()
                })
                .eq('id', userId);

            if (error) {
                throw error;
            }

            setSuccessMessage('Perubahan profil berhasil disimpan!');
            setOrigNama(namaLengkap.trim());
            setOrigNim(nimNip.trim());
            setOrigKelas(kelas.trim());
            
            setTimeout(() => {
                setIsEditing(false);
                setSuccessMessage(null);
            }, 1000);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
                    <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memuat profil Anda...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] dark:text-neutral-300 font-sans pb-12 relative overflow-hidden">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            {/* HEADER NAVBAR */}
            <Navbar showBack backUrl="/" title="Profil Mahasiswa" />

            <main className="max-w-xl mx-auto px-4 py-12 relative z-10">
                <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F]/80 dark:border-neutral-800/80 backdrop-blur-md rounded-2xl p-8 shadow-sm dark:shadow-[0_0_50px_rgba(0,0,0,0.8)] relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

                    {/* Profile Header Card */}
                    <div className="flex flex-col items-center text-center mb-8 border-b border-slate-100 dark:border-neutral-900 pb-6">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-extrabold shadow-lg shadow-cyan-500/10 mb-4 select-none uppercase">
                            {getInitials(origNama)}
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{origNama}</h2>
                        <span className="mt-1 text-xs font-mono uppercase bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 text-cyan-600 dark:text-cyan-400 px-3 py-1 rounded-full">
                            {role}
                        </span>
                    </div>

                    {errorMessage && (
                        <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-600 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-400 p-4 rounded-xl text-sm">
                            <p className="font-medium leading-relaxed">{errorMessage}</p>
                        </div>
                    )}
                    {successMessage && (
                        <div className="mb-6 flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-400 p-4 rounded-xl text-sm">
                            <p className="font-medium leading-relaxed">{successMessage}</p>
                        </div>
                    )}

                    <form onSubmit={handleSave} className="space-y-6">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-500 mb-2">Email Address</label>
                            <input
                                type="text"
                                value={email}
                                disabled
                                className="w-full bg-slate-100 border border-slate-200 dark:bg-neutral-950/50 dark:border-neutral-900/80 rounded-xl py-3 px-4 text-slate-500 dark:text-neutral-550 text-sm focus:outline-none cursor-not-allowed"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">Nama Lengkap</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={namaLengkap}
                                    onChange={(e) => setNamaLengkap(e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-full bg-slate-50 border rounded-xl py-3 pl-11 pr-4 text-slate-900 focus:outline-none transition-all text-sm dark:bg-black dark:text-white ${
                                        isEditing 
                                            ? 'border-slate-300 dark:border-neutral-700 focus:border-cyan-500/80 dark:focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20' 
                                            : 'border-slate-200 dark:border-neutral-900/80 text-slate-500 dark:text-neutral-300 cursor-not-allowed'
                                    }`}
                                />
                                <User className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">Nomor Induk Mahasiswa (NIM)</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={nimNip}
                                    onChange={(e) => setNimNip(e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-full bg-slate-50 border rounded-xl py-3 pl-11 pr-4 text-slate-900 focus:outline-none transition-all text-sm dark:bg-black dark:text-white ${
                                        isEditing 
                                            ? 'border-slate-300 dark:border-neutral-700 focus:border-cyan-500/80 dark:focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20' 
                                            : 'border-slate-200 dark:border-neutral-900/80 text-slate-500 dark:text-neutral-300 cursor-not-allowed'
                                    }`}
                                />
                                <IdCard className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-500" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-neutral-400 mb-2">Kelas</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={kelas}
                                    onChange={(e) => setKelas(e.target.value)}
                                    disabled={!isEditing}
                                    className={`w-full bg-slate-50 border rounded-xl py-3 pl-11 pr-4 text-slate-900 focus:outline-none transition-all text-sm dark:bg-black dark:text-white ${
                                        isEditing 
                                            ? 'border-slate-300 dark:border-neutral-700 focus:border-cyan-500/80 dark:focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/20' 
                                            : 'border-slate-200 dark:border-neutral-900/80 text-slate-500 dark:text-neutral-300 cursor-not-allowed'
                                    }`}
                                />
                                <GraduationCap className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-500" />
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="pt-2">
                            {!isEditing ? (
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/10 text-sm tracking-widest cursor-pointer"
                                >
                                    <Edit3 className="w-4 h-4" />
                                    <span>EDIT PROFIL</span>
                                </button>
                            ) : (
                                <div className="flex gap-4">
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="flex-1 flex items-center justify-center gap-2 border border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white py-3.5 px-4 rounded-xl transition-all text-sm font-bold cursor-pointer"
                                    >
                                        <X className="w-4 h-4" />
                                        <span>BATAL</span>
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/10 disabled:opacity-50 text-sm tracking-widest cursor-pointer"
                                    >
                                        {isLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                        <span>SIMPAN</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
