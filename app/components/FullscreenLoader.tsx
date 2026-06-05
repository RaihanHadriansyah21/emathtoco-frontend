'use client';

import React from 'react';
import Image from 'next/image';
import Logo from '../Emathtoco.png';

export default function FullscreenLoader() {
    return (
        <div className="fixed inset-0 bg-gradient-to-br from-white via-cyan-50/20 to-slate-50 dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex flex-col items-center justify-center z-50 font-sans relative overflow-hidden select-none">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[25%] left-[25%] w-[350px] h-[350px] bg-cyan-400/8 dark:bg-cyan-500/10 rounded-full blur-[100px] animate-[pulse-glow_4s_ease-in-out_infinite]"></div>
                <div className="absolute bottom-[25%] right-[25%] w-[400px] h-[400px] bg-blue-400/8 dark:bg-indigo-500/10 rounded-full blur-[110px] animate-[pulse-glow_4s_ease-in-out_infinite]" style={{ animationDelay: '1.5s' }}></div>
            </div>

            {/* Floating Particles (Premium Visual Addition) */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[20%] left-[15%] w-3 h-3 rounded-full bg-cyan-400/25 dark:bg-cyan-500/15 blur-[1px] animate-[float-p-1_8s_ease-in-out_infinite]" />
                <div className="absolute top-[35%] right-[20%] w-4 h-4 rounded-full bg-blue-400/20 dark:bg-indigo-500/10 blur-[1px] animate-[float-p-2_10s_ease-in-out_infinite]" />
                <div className="absolute bottom-[30%] left-[25%] w-2.5 h-2.5 rounded-full bg-cyan-400/30 dark:bg-cyan-400/20 blur-[0.5px] animate-[float-p-3_7s_ease-in-out_infinite]" />
                <div className="absolute bottom-[20%] right-[30%] w-3 h-3 rounded-full bg-blue-400/25 dark:bg-indigo-400/15 blur-[1px] animate-[float-p-4_9s_ease-in-out_infinite]" />
                <div className="absolute top-[60%] left-[10%] w-4 h-4 rounded-full bg-cyan-400/15 dark:bg-cyan-500/10 blur-[1.5px] animate-[float-p-1_12s_ease-in-out_infinite]" />
                <div className="absolute top-[15%] right-[40%] w-2.5 h-2.5 rounded-full bg-blue-400/20 dark:bg-cyan-500/10 blur-[0.5px] animate-[float-p-3_11s_ease-in-out_infinite]" />
            </div>

            {/* Content Container */}
            <div className="relative z-10 flex flex-col items-center gap-6 text-center animate-in fade-in zoom-in-95 duration-500">
                {/* Logo Frame with Shimmer and Pulse */}
                <div className="relative p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xl dark:shadow-[0_0_40px_rgba(6,182,212,0.12)] flex items-center justify-center animate-[pulse-glow-box_3s_ease-in-out_infinite]">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 dark:via-cyan-500/20 to-transparent -translate-x-full animate-[shimmer_2.5s_infinite] pointer-events-none rounded-2xl" />
                    <Image
                        src={Logo}
                        alt="Logo Emathtoco"
                        className="h-16 w-auto object-contain"
                        priority
                    />
                </div>

                {/* Text Logo */}
                <div className="space-y-2 mt-2">
                    <h1 className="text-3xl font-extrabold tracking-widest text-slate-800 dark:text-white">
                        E-MATH<span className="bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 dark:from-cyan-400 dark:via-blue-400 dark:to-indigo-500 bg-clip-text text-transparent font-extrabold">TOCO</span>
                    </h1>
                    <p className="text-slate-500 dark:text-neutral-400 text-xs font-bold uppercase tracking-[0.3em] animate-pulse">
                        Memuat Sistem...
                    </p>
                </div>

                {/* Progress Indicator */}
                <div className="w-40 h-1 bg-slate-200 dark:bg-neutral-900 rounded-full overflow-hidden mt-4 relative">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 dark:from-cyan-400 dark:to-blue-500 rounded-full w-2/3 absolute left-0 top-0 animate-[loading-bar_1.8s_ease-in-out_infinite]" />
                </div>
            </div>

            {/* Custom animations styles */}
            <style jsx global>{`
                @keyframes shimmer {
                    100% {
                        transform: translateX(100%);
                    }
                }
                @keyframes loading-bar {
                    0% {
                        left: -100%;
                        width: 50%;
                    }
                    50% {
                        left: 30%;
                        width: 70%;
                    }
                    100% {
                        left: 100%;
                        width: 50%;
                    }
                }
                @keyframes pulse-glow {
                    0%, 100% {
                        opacity: 0.6;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 1;
                        transform: scale(1.05);
                    }
                }
                @keyframes pulse-glow-box {
                    0%, 100% {
                        transform: scale(1);
                        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
                    }
                    50% {
                        transform: scale(1.02);
                        box-shadow: 0 20px 25px -5px rgba(6, 182, 212, 0.15), 0 10px 10px -5px rgba(6, 182, 212, 0.1);
                    }
                }
                @keyframes float-p-1 {
                    0%, 100% { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.15; }
                    50% { transform: translateY(-40px) translateX(15px) scale(1.2); opacity: 0.4; }
                }
                @keyframes float-p-2 {
                    0%, 100% { transform: translateY(0px) translateX(0px) scale(1.1); opacity: 0.1; }
                    50% { transform: translateY(-50px) translateX(-20px) scale(0.9); opacity: 0.3; }
                }
                @keyframes float-p-3 {
                    0%, 100% { transform: translateY(0px) translateX(0px) scale(0.9); opacity: 0.2; }
                    50% { transform: translateY(-35px) translateX(25px) scale(1.15); opacity: 0.5; }
                }
                @keyframes float-p-4 {
                    0%, 100% { transform: translateY(0px) translateX(0px) scale(1); opacity: 0.15; }
                    50% { transform: translateY(-45px) translateX(-15px) scale(0.85); opacity: 0.35; }
                }
            `}</style>
        </div>
    );
}
