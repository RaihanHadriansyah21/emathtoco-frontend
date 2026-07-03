'use client';

import { logger } from '@/lib/logger';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Sparkles, Cpu } from 'lucide-react';
import Logo from '@/app/Emathtoco.png';
import { Spotlight } from '@/components/ui/spotlight';

// Dynamically import SplineScene with SSR disabled to prevent node environment errors
const SplineScene = dynamic(
    () => import('@/components/ui/splite').then((mod) => ({ default: mod.SplineScene })),
    { ssr: false }
);

export default function LoginAIScene() {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [isSplineReady, setIsSplineReady] = useState(false);

    // 21st.dev humanoid robot scene (chrome/black full-body robot)
    const splineSceneUrl = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode';

    // ═══════════════════════════════════════════════════════
    // LOADING & CONNECTIVITY SAFEGUARD
    // ═══════════════════════════════════════════════════════
    const isLoadingRef = React.useRef(isLoading);
    React.useEffect(() => {
        isLoadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setHasError(true);
            setIsLoading(false);
            return;
        }

        let isMounted = true;

        // Safety-net: catch any Spline-related unhandled rejections (e.g. WASM / texture
        // fetches) that bypass the connectivity pre-check, so they don't surface in the
        // Next.js dev overlay.
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            const msg: string = event.reason?.message ?? String(event.reason ?? '');
            if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('CORS')) {
                event.preventDefault(); // suppress browser console log
                logger.warn('[LoginAIScene] Spline unhandled rejection suppressed:', msg);
                if (isMounted) {
                    setHasError(true);
                    setIsLoading(false);
                }
            }
        };
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        const checkSplineConnectivity = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second timeout limit

                // Fetch the first 8 bytes of the scene file with CORS mode.
                // We check BOTH:
                //   1. response.ok / status — must be 200 or 206 (partial content for range)
                //   2. content-type — must NOT be text/html (firewall block pages return HTML)
                const response = await fetch(splineSceneUrl, {
                    method: 'GET',
                    mode: 'cors',
                    signal: controller.signal,
                    headers: { 'Range': 'bytes=0-7' },
                });

                clearTimeout(timeoutId);

                // Reject HTTP errors (4xx / 5xx)
                if (!response.ok && response.status !== 206) {
                    throw new Error(`Spline CDN returned HTTP ${response.status}`);
                }

                // Reject HTML responses — firewalls/proxies return block pages as text/html
                // The real .splinecode binary file will never have a text/html content-type
                const contentType = response.headers.get('content-type') ?? '';
                if (contentType.toLowerCase().includes('text/html')) {
                    throw new Error(`CDN returned HTML (likely a firewall block page), content-type: ${contentType}`);
                }

                if (isMounted) {
                    setIsSplineReady(true);
                }
            } catch (err) {
                logger.warn('Spline CDN is unreachable or client is offline. Gracefully falling back to static view.', err);
                if (isMounted) {
                    setHasError(true);
                    setIsLoading(false);
                }
            }
        };

        checkSplineConnectivity();

        const safeguardTimer = setTimeout(() => {
            if (isMounted && isLoadingRef.current) {
                logger.warn('Spline load timed out (20s safeguard). Falling back to premium static view.');
                setHasError(true);
            }
        }, 20000);

        return () => {
            isMounted = false;
            clearTimeout(safeguardTimer);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    return (
        <div className="relative w-full h-full min-h-[400px] lg:min-h-screen bg-transparent flex items-center justify-center overflow-hidden">
            {/* Spotlight Effect — Aceternity */}
            <Spotlight
                className="-top-40 left-0 md:left-60 md:-top-20"
                fill="white"
            />

            <AnimatePresence mode="wait">
                {hasError ? (
                    // ═══════════════════════════════════════════════════════
                    // STATIC FALLBACK STATE
                    // ═══════════════════════════════════════════════════════
                    <motion.div
                         key="fallback"
                         initial={{ opacity: 0, scale: 0.95 }}
                         animate={{ opacity: 1, scale: 1 }}
                         exit={{ opacity: 0, scale: 0.95 }}
                         transition={{ duration: 0.5 }}
                         className="relative z-10 flex flex-col items-center justify-center p-8 text-center max-w-sm"
                     >
                         <div className="relative group mb-6">
                             {/* Glowing effect behind logo */}
                             <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-500 pointer-events-none" />
                             <div className="relative bg-[#0A0A0F]/90 border border-neutral-800/80 backdrop-blur-md rounded-2xl p-5 shadow-2xl">
                                 <Image
                                     src={Logo}
                                     alt="Logo E-MATHTOCO"
                                     className="h-16 w-auto object-contain"
                                     priority
                                 />
                             </div>
                         </div>
 
                         <div className="flex items-center gap-2 mb-2 justify-center">
                             <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
                             <span className="text-neutral-400 text-xs font-bold uppercase tracking-[0.2em]">E-MATHTOCO AI</span>
                         </div>
                         
                         <h2 className="text-xl font-extrabold text-white tracking-wide mb-3">
                             AI Assessment Assistant
                         </h2>
                         
                         <p className="text-neutral-500 text-sm leading-relaxed">
                             Digital grading assistant powered by customized Deep Learning networks to grade handwritten essays automatically.
                         </p>
                     </motion.div>
                ) : (
                    // ═══════════════════════════════════════════════════════
                    // ACTIVE SPLINE / LOADING SCENE
                    // ═══════════════════════════════════════════════════════
                    <div className="relative w-full h-full flex items-center justify-center z-10">
                        {/* Loading Spinner Fallback */}
                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
                                <div className="relative flex items-center justify-center mb-4">
                                    <div className="absolute w-12 h-12 border border-cyan-500/20 rounded-full animate-ping" />
                                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                                </div>
                                <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-widest text-xs animate-pulse">
                                    <Cpu className="w-3.5 h-3.5" />
                                    <span>Menginisialisasi Asisten AI...</span>
                                </div>
                            </div>
                        )}

                        {isSplineReady && (
                            <SplineScene
                                scene={splineSceneUrl}
                                className="w-full h-full"
                                onLoad={() => setIsLoading(false)}
                                onError={(err) => {
                                    logger.warn('[LoginAIScene] Spline unreachable, switching to static fallback:', err);
                                    setHasError(true);
                                    setIsLoading(false);
                                }}
                            />
                        )}
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
