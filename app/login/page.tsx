'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import Logo from '../Emathtoco.png';
import { GraduationCap, BookOpen, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginSelectionPage() {
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);

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
            } finally {
                setIsChecking(false);
            }
        };
        checkSession();
    }, [router]);

    if (isChecking) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] flex items-center justify-center px-4 font-sans relative overflow-hidden">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
                <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-purple-500/8 rounded-full blur-[100px]"></div>
            </div>

            <div className="w-full max-w-2xl relative z-10">
                {/* Branding Header */}
                <div className="text-center mb-10">
                    <div className="mx-auto w-fit bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-5 flex items-center justify-center">
                        <Image
                            src={Logo}
                            alt="Logo E-MATHTOCO"
                            className="h-12 w-auto object-contain"
                            priority
                        />
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider text-white">
                        E-MATH<span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-extrabold">TOCO</span>
                    </h1>
                    <p className="text-neutral-400 text-xs uppercase tracking-[0.2em] mt-2">Essay Mathematics Auto Correction</p>
                    <p className="text-neutral-500 text-sm mt-4">Pilih jenis akun untuk masuk ke sistem</p>
                </div>

                {/* Role Selection Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Mahasiswa Card */}
                    <button
                        onClick={() => router.push('/login/mahasiswa')}
                        className="group relative bg-[#0A0A0F]/80 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden text-left transition-all duration-300 hover:border-cyan-500/40 hover:shadow-[0_0_40px_rgba(6,182,212,0.08)] cursor-pointer"
                    >
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-500"></div>

                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center mb-5 group-hover:from-cyan-500/20 group-hover:to-blue-500/20 group-hover:border-cyan-500/40 transition-all duration-300">
                            <GraduationCap className="w-7 h-7 text-cyan-400" />
                        </div>

                        <h2 className="text-xl font-extrabold text-white mb-2 tracking-wide group-hover:text-cyan-300 transition-colors duration-200">Mahasiswa</h2>
                        <p className="text-neutral-500 text-sm leading-relaxed mb-6">Unggah jawaban, lihat hasil penilaian AI, dan pantau progres tugas.</p>

                        <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-widest group-hover:gap-3 transition-all duration-300">
                            <span>Masuk sebagai Mahasiswa</span>
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </button>

                    {/* Dosen Card */}
                    <button
                        onClick={() => router.push('/login/dosen')}
                        className="group relative bg-[#0A0A0F]/80 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.6)] overflow-hidden text-left transition-all duration-300 hover:border-indigo-500/40 hover:shadow-[0_0_40px_rgba(99,102,241,0.08)] cursor-pointer"
                    >
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-500"></div>

                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 flex items-center justify-center mb-5 group-hover:from-indigo-500/20 group-hover:to-purple-500/20 group-hover:border-indigo-500/40 transition-all duration-300">
                            <BookOpen className="w-7 h-7 text-indigo-400" />
                        </div>

                        <h2 className="text-xl font-extrabold text-white mb-2 tracking-wide group-hover:text-indigo-300 transition-colors duration-200">Dosen</h2>
                        <p className="text-neutral-500 text-sm leading-relaxed mb-6">Kelola kelas, pantau mahasiswa, dan review hasil AI.</p>

                        <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest group-hover:gap-3 transition-all duration-300">
                            <span>Masuk sebagai Dosen</span>
                            <ArrowRight className="w-4 h-4" />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
}