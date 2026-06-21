'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UploadCloud, ImageIcon, RefreshCw, AlertCircle, Sparkles, ZoomIn, Info } from 'lucide-react';
import Navbar from '../../components/Navbar';
import PageTransition from '@/components/ui/PageTransition';

interface DiagnosticResult {
    originalName: string;
    originalSize: number;
    originalWidth: number;
    originalHeight: number;
    originalUrl: string;
    compressedSize: number;
    compressedWidth: number;
    compressedHeight: number;
    compressedUrl: string;
    ratio: string;
    qualityUsed: number;
    dimensionLimitUsed: number;
    skipped: boolean;
}

export default function ImageDiagnostics() {
    const router = useRouter();
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<DiagnosticResult | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // HEIC/HEIF Check
        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        if (['heic', 'heif'].includes(extension)) {
            setErrorMsg('Format HEIC/HEIF tidak didukung di browser secara langsung. Silakan gunakan JPG, JPEG, atau PNG.');
            setResult(null);
            return;
        }

        if (!['jpg', 'jpeg', 'png'].includes(extension)) {
            setErrorMsg('Format file tidak didukung. Silakan pilih berkas JPG, JPEG, atau PNG.');
            setResult(null);
            return;
        }

        setErrorMsg(null);
        setIsProcessing(true);

        try {
            const originalUrl = URL.createObjectURL(file);
            const originalSizeMB = file.size / (1024 * 1024);

            // Fetch image dimensions
            const img = new Image();
            img.src = originalUrl;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Gagal memuat gambar asli.'));
            });

            const originalWidth = img.width;
            const originalHeight = img.height;

            // Apply Adaptive Compression Strategy (Task 2)
            if (originalSizeMB <= 1) {
                // Skipped compression
                setResult({
                    originalName: file.name,
                    originalSize: file.size,
                    originalWidth,
                    originalHeight,
                    originalUrl,
                    compressedSize: file.size,
                    compressedWidth: originalWidth,
                    compressedHeight: originalHeight,
                    compressedUrl: originalUrl,
                    ratio: '0.00%',
                    qualityUsed: 1.0,
                    dimensionLimitUsed: originalWidth > originalHeight ? originalWidth : originalHeight,
                    skipped: true
                });
                setIsProcessing(false);
                return;
            }

            let maxDimension = 1200;
            let quality = 0.75;

            if (originalSizeMB <= 5) {
                maxDimension = 1600;
                quality = 0.8;
            } else if (originalSizeMB <= 10) {
                maxDimension = 1200;
                quality = 0.75;
            } else {
                maxDimension = 1000;
                quality = 0.7;
            }

            // Perform Canvas Compression (Task 4 Memory Safety embedded)
            const canvas = document.createElement('canvas');
            let width = originalWidth;
            let height = originalHeight;

            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);

            const compressedBlob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob(
                    (blob) => {
                        // Clear canvas memory references immediately
                        canvas.width = 0;
                        canvas.height = 0;
                        img.onload = null;
                        img.onerror = null;
                        resolve(blob);
                    },
                    'image/jpeg',
                    quality
                );
            });

            if (!compressedBlob) {
                throw new Error('Gagal melakukan kompresi gambar.');
            }

            const compressedUrl = URL.createObjectURL(compressedBlob);
            const ratio = ((file.size - compressedBlob.size) / file.size * 100).toFixed(2) + '%';

            setResult({
                originalName: file.name,
                originalSize: file.size,
                originalWidth,
                originalHeight,
                originalUrl,
                compressedSize: compressedBlob.size,
                compressedWidth: width,
                compressedHeight: height,
                compressedUrl,
                ratio,
                qualityUsed: quality,
                dimensionLimitUsed: maxDimension,
                skipped: false
            });

        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || 'Terjadi kesalahan saat mengompresi gambar.');
        } finally {
            setIsProcessing(false);
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = 2;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    return (
        <PageTransition>
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans pb-24 relative overflow-hidden flex flex-col">
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/12 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/12 rounded-full blur-[130px]"></div>
            </div>

            <Navbar showBack backUrl="/admin" title="Diagnostik Kualitas Gambar & Kompresi" subtitle="Halaman Internal Validasi Kejelasan Simbol Matematika AI" />

            <main className="max-w-6xl mx-auto px-4 py-8 relative z-10 w-full flex-grow">
                {/* Upload Section */}
                <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 backdrop-blur-md rounded-2xl p-6 mb-8 shadow-lg">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                        <UploadCloud className="w-5 h-5 text-cyan-400" />
                        Unggah Gambar Untuk Uji Coba Kompresi
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-neutral-400 mb-4">
                        Halaman ini meniru persis strategi kompresi adaptif yang digunakan mahasiswa di HP. Unggah foto lembar jawaban berskala besar untuk memvalidasi keterbacaan simbol matematika kecil oleh AI dan dosen.
                    </p>

                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-350 dark:border-neutral-800 hover:border-cyan-500/50 dark:hover:border-cyan-500/40 rounded-2xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-neutral-950/40"
                    >
                        <ImageIcon className="w-12 h-12 text-slate-400 dark:text-neutral-600 mx-auto mb-3" />
                        <span className="text-sm font-semibold text-slate-600 dark:text-neutral-400 block">Klik untuk memilih gambar lembar jawaban</span>
                        <span className="text-xs text-slate-400 dark:text-neutral-500 block mt-1">Hanya mendukung JPG, JPEG, PNG</span>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept="image/*" 
                            className="hidden" 
                        />
                    </div>

                    {errorMsg && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}
                </div>

                {isProcessing && (
                    <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl shadow-lg">
                        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">Sedang mengompresi gambar...</span>
                    </div>
                )}

                {result && (
                    <div className="space-y-6">
                        {/* Metrics Table */}
                        <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 backdrop-blur-md rounded-2xl p-6 shadow-lg">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-cyan-400" />
                                Hasil Analisis Kompresi
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-950/50 border border-slate-100 dark:border-neutral-900">
                                    <span className="text-xs text-slate-400 dark:text-neutral-500 block font-bold uppercase tracking-wider">Ukuran Berkas</span>
                                    <div className="mt-1 flex flex-col">
                                        <span className="text-sm text-slate-500 line-through">Asli: {formatBytes(result.originalSize)}</span>
                                        <span className="text-lg font-extrabold text-cyan-400">{formatBytes(result.compressedSize)}</span>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-950/50 border border-slate-100 dark:border-neutral-900">
                                    <span className="text-xs text-slate-400 dark:text-neutral-500 block font-bold uppercase tracking-wider">Rasio Kompresi</span>
                                    <div className="mt-1">
                                        <span className="text-2xl font-extrabold text-indigo-400">{result.ratio}</span>
                                        <span className="text-xs text-slate-500 dark:text-neutral-500 block">Ruang terhemat</span>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-950/50 border border-slate-100 dark:border-neutral-900">
                                    <span className="text-xs text-slate-400 dark:text-neutral-500 block font-bold uppercase tracking-wider">Resolusi Akhir</span>
                                    <div className="mt-1 flex flex-col">
                                        <span className="text-xs text-slate-500">Asli: {result.originalWidth}x{result.originalHeight} px</span>
                                        <span className="text-base font-extrabold text-emerald-400">{result.compressedWidth}x{result.compressedHeight} px</span>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-neutral-950/50 border border-slate-100 dark:border-neutral-900">
                                    <span className="text-xs text-slate-400 dark:text-neutral-500 block font-bold uppercase tracking-wider">Strategi Adaptif</span>
                                    <div className="mt-1">
                                        {result.skipped ? (
                                            <span className="text-sm font-bold text-amber-500">Dilewati (&le;1MB)</span>
                                        ) : (
                                            <>
                                                <span className="text-base font-extrabold text-slate-700 dark:text-white">Kualitas {Math.round(result.qualityUsed * 100)}%</span>
                                                <span className="text-[10px] text-slate-400 block">Batas: {result.dimensionLimitUsed}px</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Side-by-Side Comparison Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Original */}
                            <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 backdrop-blur-md rounded-2xl p-6 shadow-lg flex flex-col">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="font-bold text-slate-900 dark:text-white text-sm">Gambar Asli ({result.originalWidth}x{result.originalHeight})</span>
                                    <span className="text-xs text-slate-500 font-mono">{formatBytes(result.originalSize)}</span>
                                </div>
                                <div className="border border-slate-200 dark:border-neutral-900 rounded-xl overflow-hidden bg-neutral-950 flex-grow flex items-center justify-center min-h-[350px] max-h-[500px]">
                                    <img 
                                        src={result.originalUrl} 
                                        alt="Original" 
                                        style={{ transform: `scale(${zoomLevel})` }}
                                        className="max-w-full max-h-[450px] object-contain transition-transform origin-center" 
                                    />
                                </div>
                            </div>

                            {/* Compressed */}
                            <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 backdrop-blur-md rounded-2xl p-6 shadow-lg flex flex-col">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="font-bold text-slate-900 dark:text-white text-sm">Hasil Kompresi ({result.compressedWidth}x{result.compressedHeight})</span>
                                    <span className="text-xs text-cyan-400 font-bold font-mono">{formatBytes(result.compressedSize)} ({result.ratio} lebih kecil)</span>
                                </div>
                                <div className="border border-slate-200 dark:border-neutral-900 rounded-xl overflow-hidden bg-neutral-950 flex-grow flex items-center justify-center min-h-[350px] max-h-[500px]">
                                    <img 
                                        src={result.compressedUrl} 
                                        alt="Compressed" 
                                        style={{ transform: `scale(${zoomLevel})` }}
                                        className="max-w-full max-h-[450px] object-contain transition-transform origin-center" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Zoom Control & Instructions */}
                        <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 backdrop-blur-md rounded-2xl p-6 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <Info className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                                <p className="text-xs text-slate-500 dark:text-neutral-400 max-w-xl">
                                    Gunakan penggeser zoom untuk memeriksa bagian detil tulisan tangan. Pastikan simbol matematika kecil seperti $\theta, x_i, \int, \pm$ tetap tajam dan tidak pecah agar pembacaan AI akurat.
                                </p>
                            </div>

                            <div className="flex items-center gap-3 flex-shrink-0 w-full md:w-auto">
                                <ZoomIn className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-semibold text-slate-600 dark:text-neutral-400">Zoom: {zoomLevel}x</span>
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="5" 
                                    step="0.5" 
                                    value={zoomLevel} 
                                    onChange={(e) => setZoomLevel(parseFloat(e.target.value))} 
                                    className="w-32 accent-cyan-400" 
                                />
                                <button
                                    onClick={() => setZoomLevel(1)}
                                    className="px-3 py-1 rounded bg-slate-100 dark:bg-neutral-900 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-neutral-300 transition-colors"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    </PageTransition>
  );
}
