'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import Spline from '@splinetool/react-spline';
import type { Application } from '@splinetool/runtime';

interface SplineSceneProps {
    scene: string;
    className?: string;
    onLoad?: () => void;
    onError?: () => void;
}

export default function SplineScene({ scene, className, onLoad, onError }: SplineSceneProps) {
    const [hasError, setHasError] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Wait for container to have real dimensions before mounting Spline
    useEffect(() => {
        const checkDimensions = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                if (clientWidth > 0 && clientHeight > 0) {
                    setIsReady(true);
                    return true;
                }
            }
            return false;
        };

        if (checkDimensions()) return;

        if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
            const observer = new ResizeObserver(() => {
                if (checkDimensions()) {
                    observer.disconnect();
                }
            });
            if (containerRef.current) {
                observer.observe(containerRef.current);
            }
            return () => observer.disconnect();
        } else {
            const interval = setInterval(() => {
                if (checkDimensions()) {
                    clearInterval(interval);
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, []);

    const handleSplineLoad = useCallback((splineApp: Application) => {
        console.log('Spline scene loaded successfully');
        if (onLoad) onLoad();
    }, [onLoad]);

    const handleSplineError = useCallback((err: unknown) => {
        console.error('Spline failed to load:', err);
        setHasError(true);
        if (onError) onError();
    }, [onError]);

    if (hasError) {
        return null;
    }

    return (
        <div 
            ref={containerRef} 
            className={className}
            style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%',
                overflow: 'hidden'
            }}
        >
            {isReady ? (
                <Spline
                    scene={scene}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                    onLoad={handleSplineLoad}
                    onError={handleSplineError}
                />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#060814]/90 z-20">
                    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    <span className="text-neutral-400 text-xs font-bold uppercase tracking-widest mt-4">
                        Menginisialisasi Asisten AI...
                    </span>
                </div>
            )}
        </div>
    );
}
