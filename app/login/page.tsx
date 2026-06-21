'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import Logo from '../Emathtoco.png';
import { GraduationCap, BookOpen, ArrowRight, Loader2, Sparkles, ArrowLeft, LogIn } from 'lucide-react';
import LoginAIScene from '@/components/ui/login-ai-scene';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '@/components/ui/PageTransition';
import TextType from '@/components/ui/TextType';
import ShinyText from '@/components/ui/ShinyText';

export default function LoginSelectionPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isChecking, setIsChecking] = useState(true);
    const [showSelection, setShowSelection] = useState(searchParams.get('select') === 'true');

    const selectParam = searchParams.get('select');
    useEffect(() => {
        setShowSelection(selectParam === 'true');
    }, [selectParam]);

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
        <PageTransition>
            <div className="min-h-screen bg-gradient-to-br from-[#060814] via-[#020205] to-[#000000] relative overflow-hidden font-sans">
            {/* ═══════════════════════════════════════════════════════ */}
            {/* BACKGROUND AMBIENT GLOWS                              */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* TOP NAVIGATION BAR                                    */}
            {/* ═══════════════════════════════════════════════════════ */}
            <motion.nav
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 sm:px-10 lg:px-14 py-5"
            >
                {/* Left: Brand Text Only */}
                <div className="flex items-center">
                    <span className="text-sm font-bold tracking-wider flex items-center gap-0">
                        <ShinyText
                            text="E-MATH"
                            color="#a3a3a3"
                            shineColor="#ffffff"
                            speed={3}
                            className="font-bold"
                        />
                        <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-bold">
                            TOCO
                        </span>
                    </span>
                </div>

                {/* Right: Login Button */}
                <AnimatePresence mode="wait">
                    {!showSelection ? (
                        <motion.button
                            key="login-btn"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            transition={{ duration: 0.4 }}
                            onClick={() => {
                                router.replace('/login?select=true');
                                setShowSelection(true);
                            }}
                            className="hidden md:flex group items-center gap-1.5 bg-white/[0.03] hover:bg-white/[0.08] backdrop-blur-md border border-white/[0.08] hover:border-cyan-500/30 text-neutral-300 hover:text-white px-3.5 py-2 rounded-xl transition-all duration-300 cursor-pointer shadow-sm active:scale-95 text-xs font-bold tracking-widest uppercase"
                        >
                            <LogIn className="w-3.5 h-3.5 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
                            <span>Masuk</span>
                        </motion.button>
                    ) : (
                        <motion.button
                            key="back-btn"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            transition={{ duration: 0.4 }}
                            onClick={() => {
                                router.replace('/login');
                                setShowSelection(false);
                            }}
                            className="group flex items-center gap-1.5 bg-white/[0.03] hover:bg-white/[0.08] backdrop-blur-md border border-white/[0.08] hover:border-neutral-500/30 text-neutral-300 hover:text-white px-3.5 py-2 rounded-xl transition-all duration-300 cursor-pointer shadow-sm active:scale-95 text-xs font-bold tracking-widest uppercase"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white transition-colors" />
                            <span>Kembali</span>
                        </motion.button>
                    )}
                </AnimatePresence>
            </motion.nav>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* MAIN CONTENT AREA                                     */}
            {/* ═══════════════════════════════════════════════════════ */}
            <div className="relative z-10 flex flex-col lg:flex-row min-h-screen">
                <AnimatePresence mode="wait">
                    {!showSelection ? (
                        /* ═══════════════════════════════════════════ */
                        /* WELCOME STATE                               */
                        /* ═══════════════════════════════════════════ */
                        <motion.div
                            key="welcome"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, x: -60, transition: { duration: 0.4, ease: 'easeInOut' } }}
                            transition={{ duration: 0.6 }}
                            className="flex flex-col lg:flex-row w-full min-h-screen"
                        >
                            {/* Left: Branding & Text Content */}
                            <div className="w-full lg:w-[45%] flex items-center justify-center lg:justify-start p-6 sm:p-12 lg:pl-14 lg:pr-6 relative z-10 min-h-screen">
                                <motion.div
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.7, delay: 0.3 }}
                                    className="w-full max-w-lg"
                                >
                                    {/* Badge */}
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.5, delay: 0.5 }}
                                        className="flex items-center gap-2 mb-6"
                                    >
                                        <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                                        <span className="text-neutral-500 text-[11px] font-bold uppercase tracking-[0.25em]">
                                            AI-Powered Assessment Platform
                                        </span>
                                    </motion.div>

                                    {/* Logo */}
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.5, delay: 0.4 }}
                                        className="w-fit bg-white border border-slate-200 rounded-2xl p-5 shadow-lg mb-8"
                                    >
                                        <Image
                                            src={Logo}
                                            alt="Logo E-MATHTOCO"
                                            className="h-14 w-auto object-contain"
                                            priority
                                        />
                                    </motion.div>

                                    {/* Title */}
                                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-wider leading-[1.1] flex flex-wrap items-center">
                                        <ShinyText
                                            text="E-MATH"
                                            color="#a3a3a3"
                                            shineColor="#ffffff"
                                            speed={3.5}
                                            className="font-extrabold"
                                        />
                                        <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                                            TOCO
                                        </span>
                                    </h1>

                                    {/* Subtitle */}
                                    <div className="mt-3 flex flex-col gap-1">
                                        <p className="text-neutral-400 text-xs uppercase tracking-[0.2em] font-bold">
                                            Essay Mathematics Auto Correction
                                        </p>
                                    </div>

                                    {/* Separator */}
                                    <div className="w-16 h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full mt-6 mb-6"></div>

                                    {/* Description */}
                                    <p className="text-neutral-500 text-sm sm:text-base leading-relaxed max-w-md min-h-[72px] sm:min-h-[48px]">
                                        Sistem berbasis kecerdasan buatan untuk mengoreksi dan menilai lembar jawaban matematika essay secara{' '}
                                        <TextType
                                            text={['instan.', 'objektif.', 'otomatis.']}
                                            as="span"
                                            typingSpeed={75}
                                            deletingSpeed={45}
                                            pauseDuration={1800}
                                            className="text-cyan-400 font-semibold"
                                            showCursor={true}
                                            cursorCharacter="|"
                                        />
                                    </p>

                                    {/* Mobile-only login button */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.8 }}
                                        className="mt-10 lg:hidden"
                                    >
                                        <button
                                            onClick={() => {
                                                router.replace('/login?select=true');
                                                setShowSelection(true);
                                            }}
                                            className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-4 px-6 rounded-xl transition-all duration-300 flex items-center justify-center gap-2.5 shadow-lg shadow-cyan-500/10 hover:scale-[1.02] active:scale-[0.98] text-sm tracking-wider cursor-pointer"
                                        >
                                            <span>MASUK KE SISTEM</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </motion.div>
                                </motion.div>
                            </div>

                            {/* Right: 3D Robot Scene */}
                            <div className="hidden lg:block lg:w-[55%] h-screen relative">
                                <LoginAIScene />
                            </div>
                        </motion.div>
                    ) : (
                        /* ═══════════════════════════════════════════ */
                        /* ROLE SELECTION STATE                        */
                        /* ═══════════════════════════════════════════ */
                        <motion.div
                            key="selection"
                            initial={{ opacity: 0, x: 60 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 60, transition: { duration: 0.3, ease: 'easeInOut' } }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="w-full min-h-screen flex items-center justify-center px-4 sm:px-6"
                        >
                            <div className="w-full max-w-2xl">
                                {/* Branding Header */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: 0.15 }}
                                    className="text-center mb-10"
                                >
                                    <div className="mx-auto w-fit bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-5 flex items-center justify-center">
                                        <Image
                                            src={Logo}
                                            alt="Logo E-MATHTOCO"
                                            className="h-10 w-auto object-contain"
                                            priority
                                        />
                                    </div>
                                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-wider flex items-center justify-center">
                                        <ShinyText
                                            text="E-MATH"
                                            color="#a3a3a3"
                                            shineColor="#ffffff"
                                            speed={3}
                                            className="font-extrabold"
                                        />
                                        <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-extrabold">
                                            TOCO
                                        </span>
                                    </h1>
                                    <p className="text-neutral-400 text-xs uppercase tracking-[0.2em] mt-2">Essay Mathematics Auto Correction</p>
                                    <p className="text-neutral-500 text-sm mt-4">Pilih jenis akun untuk masuk ke sistem</p>
                                </motion.div>

                                {/* Role Selection Cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {/* Mahasiswa Card */}
                                    <motion.button
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.25 }}
                                        onClick={() => router.push('/login/mahasiswa')}
                                        className="group relative bg-[#07070C]/65 border border-white/5 dark:border-neutral-800/60 backdrop-blur-md rounded-2xl p-6 sm:p-7 shadow-xl overflow-hidden text-left transition-all duration-300 hover:border-cyan-500/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.05)] cursor-pointer w-full"
                                    >
                                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-500"></div>

                                        <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4 transition-all duration-300 group-hover:border-cyan-500/30 group-hover:bg-cyan-500/5">
                                            <GraduationCap className="w-5 h-5 text-neutral-400 group-hover:text-cyan-400 transition-colors" />
                                        </div>

                                        <h2 className="text-lg font-bold text-white mb-1.5 tracking-wide group-hover:text-cyan-300 transition-colors duration-200">Mahasiswa</h2>
                                        <p className="text-neutral-400 text-xs leading-relaxed mb-5">Unggah jawaban, lihat hasil penilaian AI, dan pantau progres tugas.</p>

                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-450 group-hover:text-cyan-400 transition-colors duration-250">
                                            <span>Masuk sebagai Mahasiswa</span>
                                            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform duration-200" />
                                        </div>
                                    </motion.button>

                                    {/* Dosen Card */}
                                    <motion.button
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.35 }}
                                        onClick={() => router.push('/login/dosen')}
                                        className="group relative bg-[#07070C]/65 border border-white/5 dark:border-neutral-800/60 backdrop-blur-md rounded-2xl p-6 sm:p-7 shadow-xl overflow-hidden text-left transition-all duration-300 hover:border-indigo-500/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.05)] cursor-pointer w-full"
                                    >
                                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-all duration-500"></div>

                                        <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4 transition-all duration-300 group-hover:border-indigo-500/30 group-hover:bg-indigo-500/5">
                                            <BookOpen className="w-5 h-5 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                                        </div>

                                        <h2 className="text-lg font-bold text-white mb-1.5 tracking-wide group-hover:text-indigo-300 transition-colors duration-200">Dosen</h2>
                                        <p className="text-neutral-400 text-xs leading-relaxed mb-5">Kelola kelas, pantau mahasiswa, dan review hasil AI.</p>

                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-450 group-hover:text-indigo-400 transition-colors duration-250">
                                            <span>Masuk sebagai Dosen</span>
                                            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform duration-200" />
                                        </div>
                                    </motion.button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    </PageTransition>
);
}