'use client';

import { logger } from '@/lib/logger';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CheckCircle, Loader2, AlertTriangle, Eye, Lock, X, RefreshCw, Trophy, Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import Navbar from '../../components/Navbar';
import PageTransition from '@/components/ui/PageTransition';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/app/hooks/useToast';
import ToastContainer from '@/app/components/Toast';
import { apiGet, apiPost } from '@/lib/api-client';
import { replaceAnswerImage } from '@/lib/services/answer-upload-service';
import { getSubmissionStatusPollDelay } from '@/lib/egress-policy';
import {
    getAnswerImageUrl,
    getAnswerImageUrls,
    getCachedAnswerImageUrl,
} from '@/lib/storage/answer-image-urls';
import { useAuth } from '../../components/AuthGate';
import { getErrorMessage } from '@/lib/errors';

const getMaxScore = (label: string): number => {
    return label.toLowerCase().endsWith('f') ? 5 : 4;
};

// Membuat daftar 24 kombinasi section section soal (1a - 4f)
const generateSlots = () => {
    const list = [];
    const bagian = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let nomor = 1; nomor <= 4; nomor++) {
        for (const b of bagian) {
            list.push({ label: `${nomor}${b}`, nomor_soal: nomor, bagian_soal: b });
        }
    }
    return list;
};

interface SlotState {
    label: string;
    nomor_soal: number;
    bagian_soal: string;
    status: 'empty' | 'uploading' | 'success' | 'error';
    fileUrl: string | null;
    localPreviewUrl?: string | null;
    imagePath?: string;
    dbStatus?: string;
    prediksiAi?: string;
    feedback?: string;
    nilaiFinal?: number | null;
    rejectionReason?: string | null;
    wasReuploaded?: boolean;
    lastReuploadAt?: string | null;
    reuploadCount?: number;
}

const createSubmission = async (mataKuliahId: string) => {
    const { data, error } = await supabase
        .rpc('create_submission', {
            p_mata_kuliah_id: mataKuliahId,
        });
    if (error) throw error;
    if (!data) throw new Error('Gagal membuat data pengumpulan baru.');
    return { id: data as string };
};

const getExifOrientation = (file: File): Promise<number> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
        reader.onload = (e) => {
            const buffer = e.target?.result as ArrayBuffer;
            if (!buffer) {
                resolve(-1);
                return;
            }
            const view = new DataView(buffer);
            if (view.byteLength < 2 || view.getUint16(0, false) !== 0xFFD8) {
                resolve(-1);
                return;
            }
            const length = view.byteLength;
            let offset = 2;
            while (offset < length - 2) {
                const marker = view.getUint16(offset, false);
                offset += 2;
                if (marker === 0xFFE1) {
                    if (offset + 8 <= length && view.getUint32(offset + 2, false) === 0x45786966) {
                        const tiffOffset = offset + 8;
                        if (tiffOffset + 8 <= length) {
                            const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
                            const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
                            const tagStart = tiffOffset + ifdOffset;
                            if (tagStart + 2 <= length) {
                                const tagsCount = view.getUint16(tagStart, littleEndian);
                                for (let i = 0; i < tagsCount; i++) {
                                    const tagOffset = tagStart + 2 + i * 12;
                                    if (tagOffset + 12 <= length && view.getUint16(tagOffset, littleEndian) === 0x0112) {
                                        const value = view.getUint16(tagOffset + 8, littleEndian);
                                        resolve(value);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                    resolve(-1);
                    return;
                } else if ((marker & 0xFF00) !== 0xFF00) {
                    break;
                } else {
                    if (offset + 2 <= length) {
                        offset += view.getUint16(offset, false);
                    } else {
                        break;
                    }
                }
            }
            resolve(-1);
        };
        reader.onerror = () => resolve(-1);
    });
};

const checkAutoRotation = (): Promise<boolean> => {
    return new Promise((resolve) => {
        if (typeof window === 'undefined') {
            resolve(false);
            return;
        }
        const testImage = new Image();
        testImage.src = 'data:image/jpeg;base64,/9j/4QAiRXhpZgAATU0AKgAAAAgAAQEqAAIAAAAKAAAADgAAAAAA/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMiJyckFBYgJCwsMCwsMCwo/9sAQwEHBwcKCAoRCwoRJhwWIiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYm/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA=';
        testImage.onload = () => {
            const rotated = testImage.width === 1;
            resolve(rotated);
        };
        testImage.onerror = () => {
            resolve(false);
        };
    });
};

const compressImage = async (file: File): Promise<File> => {
    const orientation = await getExifOrientation(file);
    const autoRotateSupported = await checkAutoRotation();

    return new Promise((resolve) => {
        const originalSizeMB = file.size / (1024 * 1024);

        if (originalSizeMB <= 1 && orientation <= 1) {
            if (process.env.NODE_ENV !== 'production') {
                logger.debug("[UPLOAD] Skip Compression & Rotation (File size <= 1MB, no rotation):", file.size);
            }
            resolve(file);
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

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const originalWidth = img.width;
                const originalHeight = img.height;

                const needsRotation = orientation === 6 || orientation === 8 || orientation === 3;
                const needsSwap = needsRotation && !autoRotateSupported && (orientation === 6 || orientation === 8);
                
                let width = needsSwap ? img.height : img.width;
                let height = needsSwap ? img.width : img.height;

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
                if (ctx) {
                    if (needsRotation && !autoRotateSupported) {
                        if (orientation === 6) {
                            ctx.translate(width, 0);
                            ctx.rotate(90 * Math.PI / 180);
                            ctx.drawImage(img, 0, 0, height, width);
                        } else if (orientation === 8) {
                            ctx.translate(0, height);
                            ctx.rotate(-90 * Math.PI / 180);
                            ctx.drawImage(img, 0, 0, height, width);
                        } else if (orientation === 3) {
                            ctx.translate(width, height);
                            ctx.rotate(180 * Math.PI / 180);
                            ctx.drawImage(img, 0, 0, width, height);
                        } else {
                            ctx.drawImage(img, 0, 0, width, height);
                        }
                    } else {
                        ctx.drawImage(img, 0, 0, width, height);
                    }
                }

                const finalWidth = width;
                const finalHeight = height;

                canvas.toBlob(
                    (blob) => {
                        canvas.width = 0;
                        canvas.height = 0;
                        img.onload = null;
                        img.onerror = null;

                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now(),
                            });

                            if (process.env.NODE_ENV !== 'production') {
                                const ratio = ((file.size - compressedFile.size) / file.size * 100).toFixed(2) + "%";
                                logger.debug("[UPLOAD] Original Size:", file.size);
                                logger.debug("[UPLOAD] Compressed Size:", compressedFile.size);
                                logger.debug("[UPLOAD] Compression Ratio:", ratio);
                                logger.debug("[UPLOAD] EXIF Orientation:", orientation);
                                logger.debug("[UPLOAD] Auto-Rotate Supported by Browser:", autoRotateSupported);
                                logger.debug("[UPLOAD] Original Resolution:", originalWidth, originalHeight);
                                logger.debug("[UPLOAD] Final Resolution:", finalWidth, finalHeight);
                            }

                            resolve(compressedFile);
                        } else {
                            resolve(file);
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => {
                img.onload = null;
                img.onerror = null;
                resolve(file);
            };
        };
        reader.onerror = () => resolve(file);
    });
};

interface CustomCameraModalProps {
    label: string;
    initialFile?: File;
    onCapture: (file: File) => void;
    onClose: () => void;
    onFallbackToNative?: () => void;
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch: boolean };
type ResizeCorner = 'TL' | 'TR' | 'BL' | 'BR';

const CustomCameraModal: React.FC<CustomCameraModalProps> = ({ label, initialFile, onCapture, onClose, onFallbackToNative }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const analysisIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState(false);
    const [cameraErrorName, setCameraErrorName] = useState<string>('');
    const [cameraErrorMessage, setCameraErrorMessage] = useState<string>('');
    const [guideStatus, setGuideStatus] = useState<'red' | 'yellow' | 'green'>('red');
    const [guideMessage, setGuideMessage] = useState('Posisikan seluruh lembar ke dalam area panduan');

    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [capturedFile, setCapturedFile] = useState<File | null>(null);
    const [, setCoverageRatio] = useState(0);

    const [torchActive, setTorchActive] = useState(false);
    const [isTorchSupported, setIsTorchSupported] = useState(false);

    const stopCamera = () => {
        if (analysisIntervalRef.current) {
            clearInterval(analysisIntervalRef.current);
            analysisIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraActive(false);
        setTorchActive(false);
        setIsTorchSupported(false);
    };

    const toggleTorch = async () => {
        if (!streamRef.current) return;
        try {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                const nextState = !torchActive;
                await videoTrack.applyConstraints({
                    advanced: [{ torch: nextState } as TorchConstraint]
                });
                setTorchActive(nextState);
            }
        } catch (e) {
            logger.error("Failed to toggle torch:", e);
        }
    };

    const startCamera = async () => {
        try {
            logger.debug("[CAMERA] opening web camera");
            const constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            logger.debug("[CAMERA] web camera active");
            logger.debug("[TRACE] using web camera");
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setIsCameraActive(true);
            setCameraError(false);

            try {
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
                    const capabilities = videoTrack.getCapabilities() as TorchCapabilities;
                    setIsTorchSupported(Boolean(capabilities.torch));
                } else {
                    setIsTorchSupported(false);
                }
            } catch (e) {
                logger.warn("Torch check failed:", e);
                setIsTorchSupported(false);
            }

            // Start live analysis
            startLiveAnalysis();
        } catch (err: unknown) {
            logger.error('getUserMedia failed:', err);
            const errName = err instanceof Error ? err.name : "UnknownError";
            const errMsg = getErrorMessage(err, String(err));
            setCameraErrorName(errName);
            setCameraErrorMessage(errMsg);
            logger.debug("[CAMERA ERROR NAME]", errName);
            logger.debug("[CAMERA ERROR MESSAGE]", errMsg);
            logger.debug("[SECURE CONTEXT]", window.isSecureContext);
            logger.debug("[MEDIA DEVICES]", !!navigator.mediaDevices);
            setCameraError(true);
            stopCamera();
        }
    };

    useEffect(() => {
        if (!initialFile) {
            startCamera();
        }
        return () => {
            stopCamera();
        };
    // The camera lifecycle is intentionally keyed only by the incoming file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFile]);

    useEffect(() => {
        logger.debug("[TRACE] CustomCameraModal mounted");
        logger.debug("[CAMERA] overlay mounted");
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        logger.debug("[CAMERA] mobile detected", isMobile);
        logger.debug("[CAMERA] analysis state", { isAnalyzing, guideStatus, guideMessage });
    }, [isAnalyzing, guideStatus, guideMessage]);

    useEffect(() => {
        if (!previewUrl) {
            logger.debug("[CAMERA] overlay rendered");
            logger.debug("[CAMERA] overlay visible");
        }
    }, [previewUrl]);


    useEffect(() => {
        if (!initialFile) return;

        const processInitialFile = async () => {
            setIsAnalyzing(true);
            setValidationError(null);

            try {
                const url = URL.createObjectURL(initialFile);
                setPreviewUrl(url);
                setCapturedFile(initialFile);

                const img = new Image();
                img.src = url;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('Gagal mengakses canvas rendering.');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Create offscreen canvas for analytics (300x300 for performance)
                const valCanvas = document.createElement('canvas');
                valCanvas.width = 300;
                valCanvas.height = 300;
                const valCtx = valCanvas.getContext('2d');
                valCtx?.drawImage(canvas, 0, 0, 300, 300);
                const valImgData = valCtx?.getImageData(0, 0, 300, 300);

                if (!valImgData) throw new Error('Gagal memproses data gambar.');

                // 1. Brightness check (relaxed upper limit to support clean digitized scan images)
                let totalLum = 0;
                let brightCount = 0;
                const data = valImgData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    totalLum += lum;
                    if (lum > 110) {
                        brightCount++;
                    }
                }
                const avgBrightness = totalLum / (data.length / 4);
                const whiteRatio = brightCount / (data.length / 4);

                if (avgBrightness < 35) {
                    setValidationError('Foto terlalu gelap. Pastikan pencahayaan cukup.');
                    return;
                }
                if (avgBrightness > 280) {
                    setValidationError('Foto terlalu terang/silau.');
                    return;
                }

                // 2. Aspect Ratio / Shape check (relaxed to support landscape and wide proportions)
                const maxDim = Math.max(canvas.width, canvas.height);
                const minDim = Math.min(canvas.width, canvas.height);
                const aspectRatio = maxDim / minDim;
                if (aspectRatio < 1.0 || aspectRatio > 2.5) {
                    setValidationError('Pastikan seluruh lembar jawaban terlihat dengan proporsi yang benar.');
                    return;
                }

                // 3. Document Coverage check (relaxed threshold to 0.3)
                if (whiteRatio < 0.3) {
                    setValidationError('Dekatkan kamera ke lembar jawaban.');
                    return;
                }

                // 4. Blur check
                const blurResult = runBlurDetection(valImgData);
                if (blurResult.isBlur) {
                    setValidationError('Foto terlalu blur. Silakan ambil ulang foto.');
                    return;
                }

                // 5. Correct Perspective
                const finalCanvas = runPerspectiveCrop(canvas);
                finalCanvas.toBlob((blob) => {
                    if (blob) {
                        const processedFile = new File([blob], initialFile.name, { type: 'image/jpeg' });
                        setCapturedFile(processedFile);
                        URL.revokeObjectURL(url);
                        const newUrl = URL.createObjectURL(blob);
                        setPreviewUrl(newUrl);
                    }
                }, 'image/jpeg', 0.95);

            } catch (error: unknown) {
                setValidationError(`Kesalahan pemrosesan: ${getErrorMessage(error, 'UNKNOWN_ERROR')}`);
            } finally {
                setIsAnalyzing(false);
            }
        };

        processInitialFile();
    }, [initialFile]);

    const startLiveAnalysis = () => {
        if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);

        analysisIntervalRef.current = setInterval(() => {
            if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

            try {
                const video = videoRef.current;
                const canvas = document.createElement('canvas');
                canvas.width = 100;
                canvas.height = 100;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.drawImage(video, 0, 0, 100, 100);
                const imgData = ctx.getImageData(0, 0, 100, 100);
                const data = imgData.data;

                let totalLum = 0;
                let brightCount = 0;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    totalLum += lum;
                    if (lum > 110) {
                        brightCount++;
                    }
                }

                const avgBrightness = totalLum / (data.length / 4);
                const whiteRatio = brightCount / (data.length / 4);

                setCoverageRatio(whiteRatio);

                const isPortraitOrientation = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;

                if (isPortraitOrientation) {
                    setGuideStatus('red');
                    setGuideMessage('Putar HP ke Lanskap (Gunakan Orientasi Lanskap)');
                } else if (avgBrightness < 35) {
                    setGuideStatus('red');
                    setGuideMessage('Pencahayaan terlalu gelap. Cari tempat yang lebih terang.');
                } else if (avgBrightness > 280) {
                    setGuideStatus('red');
                    setGuideMessage('Pencahayaan terlalu terang/silau.');
                } else if (whiteRatio < 0.3) {
                    setGuideStatus('yellow');
                    setGuideMessage('Dekatkan kamera ke lembar jawaban');
                } else if (whiteRatio > 0.85) {
                    setGuideStatus('yellow');
                    setGuideMessage('Jauhkan kamera sedikit');
                } else {
                    setGuideStatus('green');
                    setGuideMessage('Siap difoto. Jaga kamera tetap stabil.');
                }
            } catch {
                // Ignore silent errors during live analysis
            }
        }, 350);
    };

    // Grayscale Sobel blur detection helper (Feature 4)
    const runBlurDetection = (imageData: ImageData): { isBlur: boolean; score: number } => {
        const w = imageData.width;
        const h = imageData.height;
        const data = imageData.data;
        const gray = new Uint8ClampedArray(w * h);

        for (let i = 0; i < data.length; i += 4) {
            gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }

        let edgeSum = 0;
        let edgeCount = 0;

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const gx =
                    (gray[idx - w + 1] + 2 * gray[idx + 1] + gray[idx + w + 1]) -
                    (gray[idx - w - 1] + 2 * gray[idx - 1] + gray[idx + w - 1]);
                const gy =
                    (gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1]) -
                    (gray[idx - w - 1] + 2 * gray[idx - w] + gray[idx - w + 1]);
                const mag = Math.abs(gx) + Math.abs(gy);
                edgeSum += mag;
                edgeCount++;
            }
        }

        const averageEdgeDensity = edgeSum / edgeCount;
        // Threshold of edge density for Sobel: 1.5 (relaxed to support clean scans and empty sheets)
        const isBlur = averageEdgeDensity < 1.5;
        return { isBlur, score: averageEdgeDensity };
    };

    // Safe perspective correction crop (Feature 7)
    const runPerspectiveCrop = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) return canvas;

            const w = canvas.width;
            const h = canvas.height;
            const imgData = ctx.getImageData(0, 0, w, h);
            const data = imgData.data;

            let minX = w, maxX = 0, minY = h, maxY = 0;
            let count = 0;

            for (let y = 0; y < h; y += 4) {
                for (let x = 0; x < w; x += 4) {
                    const idx = (y * w + x) * 4;
                    const brightness = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                    if (brightness > 115) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                        count++;
                    }
                }
            }

            const totalSampled = (w / 4) * (h / 4);
            const ratio = count / totalSampled;

            // If document bounds detected straight and covers a decent portion of image
            if (count > 100 && ratio > 0.15 && ratio < 0.85) {
                const padding = 15;
                minX = Math.max(0, minX - padding);
                minY = Math.max(0, minY - padding);
                maxX = Math.min(w, maxX + padding);
                maxY = Math.min(h, maxY + padding);

                const cropW = maxX - minX;
                const cropH = maxY - minY;

                if (cropW > 100 && cropH > 100) {
                    const croppedCanvas = document.createElement('canvas');
                    croppedCanvas.width = cropW;
                    croppedCanvas.height = cropH;
                    const croppedCtx = croppedCanvas.getContext('2d');
                    croppedCtx?.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
                    return croppedCanvas;
                }
            }
        } catch (e) {
            logger.error('[CAMERA] Corner/perspective correction failed:', e);
        }
        return canvas;
    };

    const handleCapture = async () => {
        if (!videoRef.current) return;
        setIsAnalyzing(true);
        setValidationError(null);

        try {
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Gagal mengakses canvas rendering.');

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Create offscreen canvas for analytics (300x300 for performance)
            const valCanvas = document.createElement('canvas');
            valCanvas.width = 300;
            valCanvas.height = 300;
            const valCtx = valCanvas.getContext('2d');
            valCtx?.drawImage(canvas, 0, 0, 300, 300);
            const valImgData = valCtx?.getImageData(0, 0, 300, 300);

            if (!valImgData) throw new Error('Gagal memproses data gambar.');

            // 1. Brightness check (Feature 5)
            let totalLum = 0;
            let brightCount = 0;
            const data = valImgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                totalLum += lum;
                if (lum > 110) {
                    brightCount++;
                }
            }
            const avgBrightness = totalLum / (data.length / 4);
            const whiteRatio = brightCount / (data.length / 4);

            if (avgBrightness < 35) {
                setValidationError('Foto terlalu gelap. Pastikan pencahayaan cukup.');
                stopCamera();
                showPreview(canvas);
                return;
            }
            if (avgBrightness > 280) {
                setValidationError('Foto terlalu terang/silau.');
                stopCamera();
                showPreview(canvas);
                return;
            }

            // 2. Aspect Ratio / Shape check (Feature 6 - relaxed aspect ratio to support landscape and wide proportions)
            const maxDim = Math.max(canvas.width, canvas.height);
            const minDim = Math.min(canvas.width, canvas.height);
            const aspectRatio = maxDim / minDim;
            if (aspectRatio < 1.0 || aspectRatio > 2.5) {
                setValidationError('Pastikan seluruh lembar jawaban terlihat dengan proporsi yang benar.');
                stopCamera();
                showPreview(canvas);
                return;
            }

            // 3. Document Coverage check (Feature 3 - relaxed threshold to 0.3)
            if (whiteRatio < 0.3) {
                setValidationError('Dekatkan kamera ke lembar jawaban.');
                stopCamera();
                showPreview(canvas);
                return;
            }

            // 4. Blur check (Feature 4)
            const blurResult = runBlurDetection(valImgData);
            if (blurResult.isBlur) {
                setValidationError('Foto terlalu blur. Silakan ambil ulang foto.');
                stopCamera();
                showPreview(canvas);
                return;
            }

            // 5. Correct Perspective (Feature 7)
            const finalCanvas = runPerspectiveCrop(canvas);

            stopCamera();
            showPreview(finalCanvas);

        } catch (error: unknown) {
            setValidationError(`Kesalahan pemrosesan: ${getErrorMessage(error, 'UNKNOWN_ERROR')}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const showPreview = (canvas: HTMLCanvasElement) => {
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
                setCapturedFile(file);
                const url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            }
        }, 'image/jpeg', 0.95);
    };

    const handleRetake = () => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        setCapturedFile(null);
        setValidationError(null);

        if (initialFile) {
            // Close the modal and let the parent re-open file selection
            onClose();
        } else {
            startCamera();
        }
    };

    const handleUsePhoto = () => {
        if (capturedFile) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            onCapture(capturedFile);
        }
    };

    const getBorderColor = () => {
        if (guideStatus === 'green') return '#10b981';
        if (guideStatus === 'yellow') return '#f59e0b';
        return '#f43f5e';
    };

    const getShadowColor = () => {
        if (guideStatus === 'green') return 'rgba(16, 185, 129, 0.4)';
        if (guideStatus === 'yellow') return 'rgba(245, 158, 11, 0.4)';
        return 'rgba(244, 63, 94, 0.4)';
    };

    const debugPanel = process.env.NODE_ENV !== "production" && (
        <div style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            width: '280px',
            maxHeight: '200px',
            overflowY: 'auto',
            fontSize: '11px',
            fontFamily: 'monospace',
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '8px',
            padding: '12px',
            pointerEvents: 'auto',
            color: '#a5f3fc',
            textAlign: 'left'
        }}>
            <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255, 255, 255, 0.15)', paddingBottom: '4px', marginBottom: '6px', color: '#38bdf8' }}>
                🐞 CAMERA DEBUG PANEL
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px' }}>
                <div>Secure Context:</div>
                <div style={{ color: typeof window !== 'undefined' && window.isSecureContext ? '#34d399' : '#f87171' }}>
                    {String(typeof window !== 'undefined' && window.isSecureContext)}
                </div>

                <div>Media Devices:</div>
                <div style={{ color: typeof navigator !== 'undefined' && !!navigator.mediaDevices ? '#34d399' : '#f87171' }}>
                    {String(typeof navigator !== 'undefined' && !!navigator.mediaDevices)}
                </div>

                <div>getUserMedia:</div>
                <div style={{ color: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia ? '#34d399' : '#f87171' }}>
                    {String(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)}
                </div>

                <div>Camera Active:</div>
                <div style={{ color: isCameraActive ? '#34d399' : '#f87171' }}>
                    {String(isCameraActive)}
                </div>

                <div>Preview Mode:</div>
                <div style={{ color: !!previewUrl ? '#f59e0b' : '#38bdf8' }}>
                    {String(!!previewUrl)}
                </div>

                <div>Camera Error:</div>
                <div style={{ color: cameraError ? '#f87171' : '#34d399' }}>
                    {String(cameraError)}
                </div>

                {cameraError && (
                    <>
                        <div>Error Name:</div>
                        <div style={{ color: '#fca5a5' }}>{cameraErrorName || 'N/A'}</div>

                        <div>Error Msg:</div>
                        <div style={{ color: '#fca5a5' }}>{cameraErrorMessage || 'N/A'}</div>
                    </>
                )}

                <div style={{ gridColumn: 'span 2', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ fontWeight: 'bold', color: '#94a3b8' }}>User Agent:</div>
                    <div style={{ color: '#e2e8f0', wordBreak: 'break-all', fontSize: '9px', marginTop: '2px' }}>
                        {typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'}
                    </div>
                </div>
            </div>
        </div>
    );

    if (cameraError) {
        return (
            <div
                className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-between text-white select-none"
                style={{ zIndex: 9999 }}
            >
                {/* Header bar */}
                <div 
                    className="w-full bg-black/60 backdrop-blur-md flex items-center justify-between px-4 z-20"
                    style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}
                >
                    <button
                        onClick={() => {
                            stopCamera();
                            onClose();
                        }}
                        className="p-2 text-white/85 hover:text-white cursor-pointer transition-colors"
                    >
                        ✕ Batal
                    </button>
                    <span className="font-extrabold text-sm tracking-widest text-cyan-400">PANDUAN FOTO - BAGIAN {label.toUpperCase()}</span>
                    <div className="w-8" />
                </div>

                <div className="flex-grow flex flex-col items-center justify-center p-6 text-center space-y-6 bg-neutral-950 w-full z-10">
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-8 h-8 text-rose-500" />
                    </div>
                    <div className="space-y-2 max-w-xs">
                        <h3 className="text-lg font-bold text-white tracking-wide">Gagal Membuka Kamera Web</h3>
                        <p className="text-xs text-neutral-400 leading-relaxed">
                            Sistem tidak dapat mengakses live camera stream. Pastikan koneksi aman (HTTPS), izin kamera diberikan, dan kamera perangkat tidak sedang digunakan aplikasi lain.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                        <button
                            onClick={() => {
                                setCameraError(false);
                                startCamera();
                            }}
                            className="h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl font-bold flex items-center justify-center gap-2 text-white cursor-pointer shadow-md shadow-cyan-500/10 transition-all active:scale-[0.98] text-sm"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span>Coba Lagi</span>
                        </button>
                        <button
                            onClick={() => {
                                logger.debug("[CAMERA] user selected native camera");
                                stopCamera();
                                if (onFallbackToNative) {
                                    onFallbackToNative();
                                } else {
                                    onClose();
                                }
                            }}
                            className="h-12 border border-neutral-800 hover:bg-white/5 rounded-xl font-bold flex items-center justify-center gap-2 text-neutral-300 hover:text-white cursor-pointer transition-colors text-sm"
                        >
                            <Camera className="w-4 h-4 text-cyan-500" />
                            <span>Gunakan Kamera Bawaan HP</span>
                        </button>
                    </div>
                </div>

                {/* Empty bottom element for layout alignment */}
                <div className="w-full h-14 bg-black/60 z-20" />
                {debugPanel}
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-between text-white select-none"
            style={{
                zIndex: 9999
            }}
        >
            {/* Header bar */}
            <div
                className="w-full bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-4 z-20 relative"
                style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}
            >
                <button
                    onClick={() => {
                        stopCamera();
                        onClose();
                    }}
                    className="p-2 text-white/85 hover:text-white cursor-pointer transition-colors"
                >
                    ✕ Batal
                </button>
                <span className="font-extrabold text-sm tracking-widest text-cyan-400">PANDUAN FOTO - BAGIAN {label.toUpperCase()}</span>
                <div className="w-8" />
            </div>

            {/* Live Camera View */}
            {!previewUrl ? (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#000000',
                    overflow: 'hidden',
                    zIndex: 0,
                    // CSS custom properties for guide box dimensions
                    '--guide-width': 'min(85vw, 450px)',
                    '--guide-height': label.toLowerCase().endsWith('f')
                        ? 'calc(min(85vw, 450px) / 1.4)'
                        : 'calc(min(85vw, 450px) / 1.8)'
                } as React.CSSProperties & Record<'--guide-width' | '--guide-height', string>}>
                    {/* Live Video Preview */}
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            zIndex: 1
                        }}
                    />

                    {/* Feature 1: Responsive Visual Overlay Guide (Light/Dark themes friendly) */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        zIndex: 100
                    }}>
                        {/* 4 Overlay Masks */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: 'calc(50% - (var(--guide-height) / 2))',
                            backgroundColor: 'rgba(0, 0, 0, 0.55)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            width: '100%',
                            height: 'calc(50% - (var(--guide-height) / 2))',
                            backgroundColor: 'rgba(0, 0, 0, 0.55)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: 'calc(50% - (var(--guide-height) / 2))',
                            bottom: 'calc(50% - (var(--guide-height) / 2))',
                            left: 0,
                            width: 'calc(50% - (var(--guide-width) / 2))',
                            backgroundColor: 'rgba(0, 0, 0, 0.55)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: 'calc(50% - (var(--guide-height) / 2))',
                            bottom: 'calc(50% - (var(--guide-height) / 2))',
                            right: 0,
                            width: 'calc(50% - (var(--guide-width) / 2))',
                            backgroundColor: 'rgba(0, 0, 0, 0.55)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />

                        {/* Clear central sheet helper bounding box */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: 'var(--guide-width)',
                            height: 'var(--guide-height)',
                            borderRadius: '16px',
                            border: `4px dashed ${getBorderColor()}`,
                            outline: '1.5px solid rgba(255, 255, 255, 0.85)',
                            outlineOffset: '-3px',
                            backgroundColor: 'transparent',
                            boxShadow: `0 0 25px ${getShadowColor()}`,
                            transition: 'all 0.3s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: '16px',
                            pointerEvents: 'none',
                            zIndex: 100
                        }}>
                            {/* Inner visual markings */}
                            <div style={{ width: '100%', textAlign: 'center', padding: '6px 0', borderBottom: '1px dashed rgba(255, 255, 255, 0.25)' }}>
                                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px', color: '#06b6d4', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                    Bagian Atas (Nomor Soal)
                                </span>
                            </div>
                            <div style={{ width: '100%', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
                                <div style={{
                                    border: '1px dashed rgba(255, 255, 255, 0.2)',
                                    borderRadius: '6px',
                                    width: '90%',
                                    height: '80%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    backgroundColor: 'rgba(0, 0, 0, 0.15)'
                                }}>
                                    <span style={{ fontSize: '9px', fontWeight: '800', letterSpacing: '1px', color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                        AREA JAWABAN LANSKAP
                                    </span>
                                    <span style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.45)', textAlign: 'center', padding: '0 4px' }}>
                                        Posisikan lembar fisik pas di batas panduan
                                    </span>
                                </div>
                            </div>
                            <div style={{ width: '100%', textAlign: 'center', padding: '6px 0', borderTop: '1px dashed rgba(255, 255, 255, 0.25)' }}>
                                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1px', color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                    Kotak Area Jawaban
                                </span>
                            </div>
                        </div>

                        {/* Feature 2: Smart status message overlay banner */}
                        <div style={{
                            position: 'absolute',
                            bottom: '24px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            textAlign: 'center',
                            width: 'calc(100% - 32px)',
                            maxWidth: '320px',
                            pointerEvents: 'none',
                            zIndex: 110
                        }}>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: getBorderColor(), transition: 'color 0.3s ease' }}>
                                {guideMessage}
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                // Capture Preview screen (Shows validation results with dashed grid representation)
                <div className="relative w-full flex-grow flex flex-col items-center justify-center bg-neutral-950 p-4" style={{ transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d' }}>
                    <div className="relative max-w-full max-h-[70vh] rounded-2xl overflow-hidden border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200" style={{ position: 'relative', isolation: 'isolate' }}>
                        <img src={previewUrl} alt="Captured preview" className="max-w-full max-h-[60vh] object-contain" style={{ display: 'block' }} />

                        {/* Dash Grid Overlay - always visible on preview screen */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            pointerEvents: 'none',
                            zIndex: 10,
                            transform: 'translate3d(0, 0, 10px)',
                            WebkitTransform: 'translate3d(0, 0, 10px)'
                        }}>
                            <div style={{
                                width: '80%',
                                height: '80%',
                                borderRadius: '12px',
                                border: `4px dashed ${validationError ? '#f43f5e' : '#10b981'}`,
                                boxShadow: `0 0 20px ${validationError ? 'rgba(244, 63, 94, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                                transition: 'all 0.3s ease'
                            }} />
                        </div>

                        {/* Floating bottom error banner instead of fullscreen blackout */}
                        {validationError && (
                            <div
                                className="absolute bottom-4 left-4 right-4 bg-rose-950/90 backdrop-blur-md border border-rose-500/40 rounded-xl p-3 flex items-center gap-3 shadow-lg z-30 animate-in slide-in-from-bottom duration-300"
                                style={{
                                    transform: 'translate3d(0, 0, 30px)',
                                    WebkitTransform: 'translate3d(0, 0, 30px)'
                                }}
                            >
                                <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center flex-shrink-0">
                                    <span className="text-sm text-rose-400 font-bold">⚠</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">Validasi Foto Gagal</h4>
                                    <p className="text-[11px] text-white/95 leading-normal">{validationError}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom action panel */}
            <div
                className={`w-full py-6 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex flex-col items-center gap-4 z-20 relative ${
                    !previewUrl
                        ? 'bg-gradient-to-t from-black/85 via-black/45 to-transparent'
                        : 'bg-black/90 backdrop-blur-md'
                }`}
                style={{
                    transform: 'translate3d(0, 0, 20px)',
                    WebkitTransform: 'translate3d(0, 0, 20px)'
                }}
            >
                {!previewUrl ? (
                    // Live camera action: large shutter button
                    <div className="flex items-center justify-center w-full relative">
                        {isTorchSupported && (
                            <button
                                onClick={toggleTorch}
                                className="absolute right-6 p-3 rounded-full bg-neutral-900/80 border border-white/10 hover:bg-neutral-800 text-white cursor-pointer transition-all flex items-center justify-center"
                                style={{ width: '46px', height: '46px' }}
                                title="Senter"
                            >
                                <span style={{ fontSize: '18px', color: torchActive ? '#fbbf24' : '#94a3b8' }}>
                                    {torchActive ? '💡' : '⚡'}
                                </span>
                            </button>
                        )}
                        <button
                            onClick={handleCapture}
                            disabled={!isCameraActive || isAnalyzing}
                            className="w-18 h-18 rounded-full border-4 border-white bg-transparent hover:bg-white/15 p-1 flex items-center justify-center cursor-pointer transition-all active:scale-95 disabled:opacity-40"
                        >
                            <div className="w-full h-full rounded-full bg-white" />
                        </button>
                    </div>
                ) : (
                    // Preview actions: Retake vs Use Photo
                    <div className="flex w-full max-w-md gap-3">
                        <button
                            onClick={handleRetake}
                            className="flex-1 h-12 border border-slate-700 bg-neutral-900 hover:bg-neutral-800 text-slate-300 font-bold rounded-xl transition-colors cursor-pointer text-sm"
                        >
                            Ambil Ulang
                        </button>
                        <button
                            disabled={!!validationError}
                            onClick={handleUsePhoto}
                            className="flex-1 h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 text-white font-bold rounded-xl transition-all cursor-pointer text-sm shadow-lg shadow-emerald-500/10"
                        >
                            Gunakan Foto
                        </button>
                    </div>
                )}
            </div>
            {debugPanel}
        </div>
    );
};

interface ImageAdjustmentModalProps {
    label: string;
    file: File;
    onConfirm: (adjustedFile: File) => void;
    onClose: () => void;
}

const ImageAdjustmentModal: React.FC<ImageAdjustmentModalProps> = ({ label, file, onConfirm, onClose }) => {
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
    const [imgUrl, setImgUrl] = useState<string>('');
    const [isAligned, setIsAligned] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // States for draggable/resizable crop box
    const [cropBox, setCropBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const isDraggingCropBox = useRef(false);
    const dragBoxStart = useRef({ x: 0, y: 0 });

    const [resizeActiveCorner, setResizeActiveCorner] = useState<'TL' | 'TR' | 'BL' | 'BR' | null>(null);
    const [resizeStartBox, setResizeStartBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const [resizeStartCursor, setResizeStartCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    
    const dragStart = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const initialPinchDist = useRef<number | null>(null);
    const initialScale = useRef(1);

    const isQuestionF = label.toLowerCase().endsWith('f');

    const initializeCropBox = () => {
        if (!containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const W_c = containerRect.width;
        const H_c = containerRect.height;
        if (W_c === 0 || H_c === 0) return;

        const ratio = isQuestionF ? 1.4 : 1.8;
        // Default width: 80% of container width or max 450px
        let w = Math.min(W_c * 0.8, 450);
        let h = w / ratio;

        // If height is too big for the container, scale down
        if (h > H_c * 0.8) {
            h = H_c * 0.8;
            w = h * ratio;
        }

        setCropBox({
            left: (W_c - w) / 2,
            top: (H_c - h) / 2,
            width: w,
            height: h
        });
    };

    useEffect(() => {
        const url = URL.createObjectURL(file);
        setImgUrl(url);
        return () => {
            URL.revokeObjectURL(url);
        };
    }, [file]);

    // Initialize crop box on load/resize
    useEffect(() => {
        if (imgUrl) {
            const timer = setTimeout(initializeCropBox, 100);
            return () => clearTimeout(timer);
        }
    // initializeCropBox reads the latest element dimensions when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imgUrl]);

    useEffect(() => {
        const handleResize = () => {
            initializeCropBox();
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    // The resize handler must be recreated only when the target aspect changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isQuestionF]);

    const checkCoverage = () => {
        if (!imgRef.current || !containerRef.current || !cropBox) return false;
        const imgRect = imgRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        
        const cropBoxLeftAbsolute = containerRect.left + cropBox.left;
        const cropBoxRightAbsolute = cropBoxLeftAbsolute + cropBox.width;
        const cropBoxTopAbsolute = containerRect.top + cropBox.top;
        const cropBoxBottomAbsolute = cropBoxTopAbsolute + cropBox.height;

        const buffer = 5;
        const covers =
            imgRect.left <= cropBoxLeftAbsolute + buffer &&
            imgRect.right >= cropBoxRightAbsolute - buffer &&
            imgRect.top <= cropBoxTopAbsolute + buffer &&
            imgRect.bottom >= cropBoxBottomAbsolute - buffer;
        return covers;
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsAligned(checkCoverage());
        }, 50);
        return () => clearTimeout(timer);
    // checkCoverage intentionally samples current DOM geometry after these values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scale, offset, rotation, cropBox]);

    const handleReset = () => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setRotation(0);
        initializeCropBox();
    };

    const handleRotateLeft = () => {
        setRotation(prev => (prev - 90 + 360) % 360);
    };

    const handleRotateRight = () => {
        setRotation(prev => (prev + 90) % 360);
    };

    const handleZoomIn = () => {
        setScale(prev => Math.min(4, prev + 0.25));
    };

    const handleZoomOut = () => {
        setScale(prev => Math.max(1, prev - 0.25));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    };

    const handleCropBoxMouseDown = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!cropBox) return;
        isDraggingCropBox.current = true;
        dragBoxStart.current = {
            x: e.clientX - cropBox.left,
            y: e.clientY - cropBox.top
        };
    };

    const handleCropBoxTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (!cropBox || e.touches.length !== 1) return;
        isDraggingCropBox.current = true;
        dragBoxStart.current = {
            x: e.touches[0].clientX - cropBox.left,
            y: e.touches[0].clientY - cropBox.top
        };
    };

    const handleResizeStart = (corner: 'TL' | 'TR' | 'BL' | 'BR', clientX: number, clientY: number) => {
        if (!cropBox) return;
        setResizeActiveCorner(corner);
        setResizeStartBox({ ...cropBox });
        setResizeStartCursor({ x: clientX, y: clientY });
    };

    const handleResizeMove = (clientX: number) => {
        if (!resizeActiveCorner || !resizeStartBox || !containerRef.current) return;
        const containerRect = containerRef.current.getBoundingClientRect();
        const W_c = containerRect.width;
        const H_c = containerRect.height;
        const ratio = isQuestionF ? 1.4 : 1.8;

        const dx = clientX - resizeStartCursor.x;
        let newWidth = resizeStartBox.width;
        let newHeight = resizeStartBox.height;
        let newLeft = resizeStartBox.left;
        let newTop = resizeStartBox.top;

        if (resizeActiveCorner === 'BR') {
            newWidth = resizeStartBox.width + dx;
            newWidth = Math.max(120, Math.min(newWidth, W_c - resizeStartBox.left));
            newHeight = newWidth / ratio;
            if (newHeight > H_c - resizeStartBox.top) {
                newHeight = H_c - resizeStartBox.top;
                newWidth = newHeight * ratio;
            }
        } else if (resizeActiveCorner === 'BL') {
            newWidth = resizeStartBox.width - dx;
            newWidth = Math.max(120, Math.min(newWidth, resizeStartBox.left + resizeStartBox.width));
            newHeight = newWidth / ratio;
            if (newHeight > H_c - resizeStartBox.top) {
                newHeight = H_c - resizeStartBox.top;
                newWidth = newHeight * ratio;
            }
            newLeft = resizeStartBox.left + (resizeStartBox.width - newWidth);
        } else if (resizeActiveCorner === 'TR') {
            newWidth = resizeStartBox.width + dx;
            newWidth = Math.max(120, Math.min(newWidth, W_c - resizeStartBox.left));
            newHeight = newWidth / ratio;
            if (newHeight > resizeStartBox.top + resizeStartBox.height) {
                newHeight = resizeStartBox.top + resizeStartBox.height;
                newWidth = newHeight * ratio;
            }
            newTop = resizeStartBox.top + (resizeStartBox.height - newHeight);
        } else if (resizeActiveCorner === 'TL') {
            newWidth = resizeStartBox.width - dx;
            newWidth = Math.max(120, Math.min(newWidth, resizeStartBox.left + resizeStartBox.width));
            newHeight = newWidth / ratio;
            if (newHeight > resizeStartBox.top + resizeStartBox.height) {
                newHeight = resizeStartBox.top + resizeStartBox.height;
                newWidth = newHeight * ratio;
            }
            newLeft = resizeStartBox.left + (resizeStartBox.width - newWidth);
            newTop = resizeStartBox.top + (resizeStartBox.height - newHeight);
        }

        setCropBox({
            left: Math.max(0, Math.min(newLeft, W_c - newWidth)),
            top: Math.max(0, Math.min(newTop, H_c - newHeight)),
            width: newWidth,
            height: newHeight
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (resizeActiveCorner) {
            handleResizeMove(e.clientX);
        } else if (isDraggingCropBox.current && cropBox && containerRef.current) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const W_c = containerRect.width;
            const H_c = containerRect.height;
            const nextLeft = e.clientX - dragBoxStart.current.x;
            const nextTop = e.clientY - dragBoxStart.current.y;

            setCropBox({
                ...cropBox,
                left: Math.max(0, Math.min(nextLeft, W_c - cropBox.width)),
                top: Math.max(0, Math.min(nextTop, H_c - cropBox.height))
            });
        } else if (isDragging.current) {
            setOffset({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        }
    };

    const handleMouseUpOrLeave = () => {
        isDragging.current = false;
        isDraggingCropBox.current = false;
        setResizeActiveCorner(null);
        setResizeStartBox(null);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            isDragging.current = true;
            dragStart.current = {
                x: e.touches[0].clientX - offset.x,
                y: e.touches[0].clientY - offset.y
            };
        } else if (e.touches.length === 2) {
            isDragging.current = false;
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialPinchDist.current = dist;
            initialScale.current = scale;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (resizeActiveCorner) {
            if (e.touches[0]) {
                handleResizeMove(e.touches[0].clientX);
            }
        } else if (isDraggingCropBox.current && cropBox && containerRef.current && e.touches[0]) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const W_c = containerRect.width;
            const H_c = containerRect.height;
            const nextLeft = e.touches[0].clientX - dragBoxStart.current.x;
            const nextTop = e.touches[0].clientY - dragBoxStart.current.y;

            setCropBox({
                ...cropBox,
                left: Math.max(0, Math.min(nextLeft, W_c - cropBox.width)),
                top: Math.max(0, Math.min(nextTop, H_c - cropBox.height))
            });
        } else if (e.touches.length === 1 && isDragging.current) {
            setOffset({
                x: e.touches[0].clientX - dragStart.current.x,
                y: e.touches[0].clientY - dragStart.current.y
            });
        } else if (e.touches.length === 2 && initialPinchDist.current !== null) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = dist / initialPinchDist.current;
            setScale(Math.min(4, Math.max(1, initialScale.current * factor)));
        }
    };

    const handleTouchEnd = () => {
        isDragging.current = false;
        isDraggingCropBox.current = false;
        initialPinchDist.current = null;
        setResizeActiveCorner(null);
        setResizeStartBox(null);
    };

    const handleWheel = (e: React.WheelEvent) => {
        const step = 0.1;
        setScale(prev => {
            const next = e.deltaY < 0 ? prev + step : prev - step;
            return Math.min(4, Math.max(1, next));
        });
    };

    const handleConfirm = async () => {
        if (isSaving || !imgRef.current) return;
        setIsSaving(true);

        try {
            const naturalW = imgRef.current.naturalWidth;
            const targetWidth = Math.min(2048, Math.max(1200, naturalW));
            const targetHeight = isQuestionF ? Math.round(targetWidth / 1.4) : Math.round(targetWidth / 1.8);

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, targetWidth, targetHeight);

                if (cropBox) {
                    const containerRect = containerRef.current!.getBoundingClientRect();

                    const canvasToVisualRatio = targetWidth / cropBox.width;

                    const guideCenterContainer = {
                        x: cropBox.left + cropBox.width / 2,
                        y: cropBox.top + cropBox.height / 2
                    };

                    const containerCenter = {
                        x: containerRect.width / 2,
                        y: containerRect.height / 2
                    };

                    const imgCenterContainer = {
                        x: containerCenter.x + offset.x,
                        y: containerCenter.y + offset.y
                    };

                    const relX_v = imgCenterContainer.x - guideCenterContainer.x;
                    const relY_v = imgCenterContainer.y - guideCenterContainer.y;

                    const relX_c = relX_v * canvasToVisualRatio;
                    const relY_c = relY_v * canvasToVisualRatio;

                    const imgCenterCanvas = {
                        x: targetWidth / 2 + relX_c,
                        y: targetHeight / 2 + relY_c
                    };

                    ctx.save();
                    ctx.translate(imgCenterCanvas.x, imgCenterCanvas.y);
                    ctx.rotate(rotation * Math.PI / 180);

                    const imgBaseWidth_v = imgRef.current.clientWidth;
                    const imgBaseHeight_v = imgRef.current.clientHeight;

                    const drawW = imgBaseWidth_v * scale * canvasToVisualRatio;
                    const drawH = imgBaseHeight_v * scale * canvasToVisualRatio;

                    ctx.drawImage(imgRef.current, -drawW / 2, -drawH / 2, drawW, drawH);
                    ctx.restore();
                }
            }

            canvas.toBlob((blob) => {
                if (blob) {
                    const adjustedFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    onConfirm(adjustedFile);
                } else {
                    onConfirm(file);
                }
                setIsSaving(false);
            }, 'image/jpeg', 0.9);
        } catch (err) {
            logger.error('Failed to crop/adjust image:', err);
            onConfirm(file);
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#09090b]/98 backdrop-blur-md z-[9999] flex flex-col justify-between text-white select-none">
            <div 
                className="w-full bg-black/60 border-b border-white/10 flex items-center justify-between px-4 z-20"
                style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(3.5rem + env(safe-area-inset-top))' }}
            >
                <button
                    onClick={onClose}
                    className="p-2 text-white/85 hover:text-white cursor-pointer transition-colors text-sm font-semibold"
                >
                    ✕ Batal
                </button>
                <span className="font-extrabold text-sm tracking-widest text-cyan-400">
                    SESUAIKAN LEMBAR - SOAL {label.toUpperCase()}
                </span>
                <div className="w-8" />
            </div>

            <div
                ref={containerRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUpOrLeave}
                onMouseLeave={handleMouseUpOrLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="relative flex-grow w-full overflow-hidden bg-black flex items-center justify-center cursor-move"
            >
                {imgUrl && (
                    <img
                        ref={imgRef}
                        src={imgUrl}
                        alt="Preview"
                        onLoad={() => {
                            setTimeout(() => setIsAligned(checkCoverage()), 100);
                        }}
                        style={{
                            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
                            transformOrigin: 'center center',
                            maxHeight: '75%',
                            maxWidth: '75%',
                            objectFit: 'contain',
                            pointerEvents: 'none',
                            userSelect: 'none',
                            transition: isDragging.current ? 'none' : 'transform 0.1s ease-out'
                        }}
                    />
                )}

                {cropBox && (
                    <>
                        {/* Masks */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${cropBox.top}px`,
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: `${cropBox.top + cropBox.height}px`,
                            bottom: 0,
                            left: 0,
                            width: '100%',
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: `${cropBox.top}px`,
                            height: `${cropBox.height}px`,
                            left: 0,
                            width: `${cropBox.left}px`,
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: `${cropBox.top}px`,
                            height: `${cropBox.height}px`,
                            left: `${cropBox.left + cropBox.width}px`,
                            right: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.7)',
                            zIndex: 90,
                            pointerEvents: 'none'
                        }} />

                        {/* Interactive Crop Box Overlay */}
                        <div
                            className="editor-guide-box"
                            style={{
                                position: 'absolute',
                                left: `${cropBox.left}px`,
                                top: `${cropBox.top}px`,
                                width: `${cropBox.width}px`,
                                height: `${cropBox.height}px`,
                                borderRadius: '12px',
                                border: `3px dashed ${isAligned ? '#10b981' : '#f59e0b'}`,
                                outline: '1.5px solid rgba(255, 255, 255, 0.8)',
                                outlineOffset: '-3px',
                                backgroundColor: 'transparent',
                                boxShadow: `0 0 25px ${isAligned ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                pointerEvents: 'auto',
                                zIndex: 100
                            }}
                            onMouseDown={handleCropBoxMouseDown}
                            onTouchStart={handleCropBoxTouchStart}
                        >
                            {/* Corner Handles */}
                            {(['TL', 'TR', 'BL', 'BR'] as const).map((corner: ResizeCorner) => {
                                const handleStyle: React.CSSProperties = {
                                    position: 'absolute',
                                    width: '18px',
                                    height: '18px',
                                    backgroundColor: '#06b6d4',
                                    border: '2px solid #ffffff',
                                    borderRadius: '50%',
                                    zIndex: 110,
                                    cursor: corner === 'TL' || corner === 'BR' ? 'nwse-resize' : 'nesw-resize',
                                };

                                if (corner === 'TL') {
                                    handleStyle.top = '-9px';
                                    handleStyle.left = '-9px';
                                } else if (corner === 'TR') {
                                    handleStyle.top = '-9px';
                                    handleStyle.right = '-9px';
                                } else if (corner === 'BL') {
                                    handleStyle.bottom = '-9px';
                                    handleStyle.left = '-9px';
                                } else if (corner === 'BR') {
                                    handleStyle.bottom = '-9px';
                                    handleStyle.right = '-9px';
                                }

                                return (
                                    <div
                                        key={corner}
                                        style={handleStyle}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            handleResizeStart(corner, e.clientX, e.clientY);
                                        }}
                                        onTouchStart={(e) => {
                                            e.stopPropagation();
                                            if (e.touches[0]) {
                                                handleResizeStart(corner, e.touches[0].clientX, e.touches[0].clientY);
                                            }
                                        }}
                                    />
                                );
                            })}

                            <div style={{
                                width: '100%',
                                textAlign: 'center',
                                padding: '8px 0',
                                borderBottom: '1.5px dashed rgba(255, 255, 255, 0.3)',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                borderTopLeftRadius: '10px',
                                borderTopRightRadius: '10px',
                                userSelect: 'none',
                                pointerEvents: 'none'
                            }}>
                                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '1.5px', color: '#06b6d4', textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}>
                                    Nomor Soal {label.toUpperCase()}
                                </span>
                            </div>

                            <div style={{
                                width: '100%',
                                flexGrow: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: 'rgba(0, 0, 0, 0.15)',
                                borderBottomLeftRadius: '10px',
                                borderBottomRightRadius: '10px',
                                padding: '10px',
                                userSelect: 'none',
                                pointerEvents: 'none'
                            }}>
                                <div style={{
                                    border: '1px dashed rgba(255, 255, 255, 0.2)',
                                    borderRadius: '6px',
                                    width: '85%',
                                    height: '75%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                    gap: '4px'
                                }}>
                                    <span style={{ fontSize: '10px', fontWeight: '800', letterSpacing: '1.5px', color: '#ffffff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                        AREA JAWABAN LANSKAP
                                    </span>
                                    <span style={{ fontSize: '8px', color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', padding: '0 4px' }}>
                                        Geser/ubah ukuran bingkai atau geser gambar agar pas di dalam garis putus-putus
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Top Alignment Warning */}
                        <div style={{
                            position: 'absolute',
                            top: '16px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '20px',
                            padding: '6px 16px',
                            textAlign: 'center',
                            pointerEvents: 'none',
                            zIndex: 110,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: isAligned ? '#10b981' : '#f59e0b',
                                boxShadow: `0 0 8px ${isAligned ? '#10b981' : '#f59e0b'}`
                            }} />
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: isAligned ? '#10b981' : '#f59e0b' }}>
                                {isAligned ? 'Area Jawaban Sesuai' : 'Geser/ubah ukuran gambar/bingkai agar sesuai'}
                            </span>
                        </div>
                    </>
                )}
            </div>

            <div className="w-full bg-black/95 border-t border-white/10 py-5 px-6 flex flex-col items-center gap-5 z-20 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-center gap-6 w-full max-w-sm">
                    <button
                        onClick={handleRotateLeft}
                        className="p-3 bg-neutral-900 border border-white/10 hover:bg-neutral-800 rounded-xl transition-all cursor-pointer"
                        title="Putar Kiri -90°"
                    >
                        <span className="text-xs font-bold block text-cyan-400">⟲ -90°</span>
                    </button>

                    <div className="flex items-center gap-3 bg-neutral-900 border border-white/10 rounded-xl p-1.5">
                        <button
                            onClick={handleZoomOut}
                            disabled={scale <= 1}
                            className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-lg text-slate-300 disabled:opacity-40 cursor-pointer"
                        >
                            －
                        </button>
                        <span className="w-12 text-center text-xs font-bold tracking-wide text-cyan-300">
                            {scale.toFixed(1)}x
                        </span>
                        <button
                            onClick={handleZoomIn}
                            disabled={scale >= 4}
                            className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-lg text-slate-300 disabled:opacity-40 cursor-pointer"
                        >
                            ＋
                        </button>
                    </div>

                    <button
                        onClick={handleRotateRight}
                        className="p-3 bg-neutral-900 border border-white/10 hover:bg-neutral-800 rounded-xl transition-all cursor-pointer"
                        title="Putar Kanan +90°"
                    >
                        <span className="text-xs font-bold block text-cyan-400">⟳ +90°</span>
                    </button>
                </div>

                <div className="flex w-full max-w-md gap-3">
                    <button
                        onClick={handleReset}
                        className="flex-1 h-12 border border-slate-700 bg-neutral-900 hover:bg-neutral-800 text-slate-300 font-bold rounded-xl transition-colors cursor-pointer text-sm"
                    >
                        Atur Ulang
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isSaving}
                        className="flex-1 h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all cursor-pointer text-sm shadow-lg shadow-cyan-500/10 flex items-center justify-center gap-2"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Memproses...</span>
                            </>
                        ) : (
                            <span>Konfirmasi & Unggah</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default function UploadWorkspace() {
    logger.debug("[WORKSPACE_RENDER]", Date.now());
    const router = useRouter();
    const params = useParams();
    const matkulId = params.id as string;
    const { user: authUser, loading: authLoading } = useAuth();

    const [slots, setSlots] = useState<SlotState[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showCustomCamera, setShowCustomCamera] = useState(false);
    const [adjustmentFile, setAdjustmentFile] = useState<File | null>(null);
    const [adjustmentLabel, setAdjustmentLabel] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [namaMatkul, setNamaMatkul] = useState('');
    const [kodeMatkul, setKodeMatkul] = useState('');
    const [submissionId, setSubmissionId] = useState<string | null>(null);
    const [dragOverLabel, setDragOverLabel] = useState<string | null>(null);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [submissionStatus, setSubmissionStatus] = useState<string | null>(null);
    const [activeDetailSlot, setActiveDetailSlot] = useState<SlotState | null>(null);
    const [nilaiAkhir, setNilaiAkhir] = useState<number | null>(null);
    const [modelAi, setModelAi] = useState<string | null>(null);
    const [activeAiJobId, setActiveAiJobId] = useState<string | null>(null);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const { toasts, toast, removeToast } = useToast();

    const [isMobile, setIsMobile] = useState(false);
    const [activeUploadChoiceLabel, setActiveUploadChoiceLabel] = useState<string | null>(null);
    const [showChoiceModal, setShowChoiceModal] = useState(false);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [showSubmitConfirmModal, setShowSubmitConfirmModal] = useState(false);
    const [justUploadedLabels, setJustUploadedLabels] = useState<string[]>([]);
    const [isDeletingSlot, setIsDeletingSlot] = useState<string | null>(null);
    const [showDesktopDeleteModal, setShowDesktopDeleteModal] = useState(false);
    const [desktopDeleteTarget, setDesktopDeleteTarget] = useState<string | null>(null);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    // Ref to persist the target slot label across async camera/gallery operations
    // This survives React state batching and iOS Safari camera app switching
    const pendingUploadLabelRef = useRef<string | null>(null);

    const [initialCameraFile, setInitialCameraFile] = useState<File | null>(null);

    const setPendingUploadLabel = (label: string | null) => {
        pendingUploadLabelRef.current = label;
        if (typeof window !== 'undefined') {
            if (label) {
                sessionStorage.setItem('pending_upload_label', label);
            } else {
                sessionStorage.removeItem('pending_upload_label');
            }
        }
    };

    const getPendingUploadLabel = (): string | null => {
        let label = pendingUploadLabelRef.current;
        if (!label && typeof window !== 'undefined') {
            label = sessionStorage.getItem('pending_upload_label');
        }
        return label;
    };

    const getStatusBadge = (dbStatus?: string) => {
        switch (dbStatus) {
            case 'draft':
                return { icon: '📝', text: 'Draft', color: 'text-neutral-400', bg: 'bg-neutral-500/10', border: 'border-neutral-500/20' };
            case 'uploaded':
                return { icon: '✓', text: 'Uploaded', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' };
            case 'submitted':
                return { icon: '⏳', text: 'Menunggu AI', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
            case 'processing_ai':
                return { icon: '🤖', text: 'Diproses AI', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
            case 'reviewed':
                return { icon: '👨‍🏫', text: 'Direview', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
            case 'finalized':
                return { icon: '🏁', text: 'Final', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
            case 'reupload_required':
                return { icon: '⚠', text: 'Reupload', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
            default:
                return { icon: '✓', text: 'Uploaded', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' };
        }
    };

    const isSlotLocked = (slot: SlotState) => {
        const currentSubStatus = submissionStatus || 'draft';
        const lockedStatuses = ['processing_ai', 'ready_review', 'reviewed', 'finalized'];
        if (lockedStatuses.includes(currentSubStatus)) {
            if (slot.dbStatus === 'reupload_required') return false;
            return true;
        }
        return false;
    };

    useEffect(() => {
        // UA-based mobile detection — reliable for camera vs file picker UX
        const checkMobile = () => {
            const ua = navigator.userAgent || '';
            const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(ua);
            setIsMobile(isMobileDevice);
            logger.debug('[DEVICE DETECT] UA:', ua, '| isMobile:', isMobileDevice);
        };
        checkMobile();
    }, []);

    const activeFetchRef = useRef<string | null>(null);
    const submissionVersionRef = useRef<string | null>(null);
    const statusFetchRef = useRef(false);
    const slotsRef = useRef(slots);
    const isDeletingSlotRef = useRef(isDeletingSlot);
    useEffect(() => {
        slotsRef.current = slots;
        isDeletingSlotRef.current = isDeletingSlot;
    }, [slots, isDeletingSlot]);

    const loadSubmissionDetails = useCallback(async (uid: string) => {
        const fetchStart = Date.now();
        logger.debug("[POLL_EXECUTION] loadSubmissionDetails start", fetchStart);
        
        const fetchKey = `${uid}-${matkulId}`;
        if (activeFetchRef.current === fetchKey) {
            logger.debug('[SYNC] Overlapping loadSubmissionDetails call ignored.');
            return;
        }
        activeFetchRef.current = fetchKey;

        try {
            // Cek data submission yang sudah ada (terbaru)
            const { data: existingSubmission, error: submissionError } = await supabase
                .from('pengumpulan_tugas')
                .select('id, status_submit, nilai_akhir, model_ai, updated_at')
                .eq('mahasiswa_id', uid)
                .eq('mata_kuliah_id', matkulId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (submissionError) throw submissionError;

            if (existingSubmission) {
                // Ambil detail lembar jawaban yang sudah diupload sebelumnya
                const { data: sheets, error: sheetsError } = await supabase
                    .from('lembar_jawaban')
                    .select(`
                        section_code,
                        image_url,
                        status,
                        prediksi_ai,
                        feedback,
                        nilai_final,
                        rejection_reason,
                        was_reuploaded,
                        last_reupload_at,
                        reupload_count
                    `)
                    .eq('pengumpulan_tugas_id', existingSubmission.id);
                if (sheetsError) throw sheetsError;

                const initialSlots = generateSlots().map(s => ({
                    ...s,
                    status: 'empty' as const,
                    fileUrl: null
                }));

                // Update submission metadata states consecutively to batch renders in React 18
                setSubmissionId(existingSubmission.id);
                setSubmissionStatus(existingSubmission.status_submit);
                setNilaiAkhir(existingSubmission.nilai_akhir ?? null);
                setModelAi(existingSubmission.model_ai ?? null);
                submissionVersionRef.current =
                    `${existingSubmission.status_submit}:${existingSubmission.updated_at ?? ''}`;

                const lockedStatuses = ['processing_ai', 'reviewed', 'finalized'];
                setIsReadOnly(lockedStatuses.includes(existingSubmission.status_submit));

                if (sheets && sheets.length > 0) {
                    const updatedSlots = initialSlots.map(slot => {
                        const sectionCode = `S-${slot.label.toUpperCase()}`;
                        const matchedSheet = sheets.find(s => s.section_code === sectionCode);
                        if (matchedSheet && matchedSheet.image_url) {
                            return {
                                ...slot,
                                status: 'success' as const,
                                imagePath: matchedSheet.image_url,
                                dbStatus: matchedSheet.status,
                                prediksiAi: matchedSheet.prediksi_ai ?? undefined,
                                feedback: matchedSheet.feedback || undefined,
                                nilaiFinal: matchedSheet.nilai_final ?? null,
                                rejectionReason: matchedSheet.rejection_reason || null,
                                wasReuploaded: matchedSheet.was_reuploaded || false,
                                lastReuploadAt: matchedSheet.last_reupload_at || null,
                                reuploadCount: matchedSheet.reupload_count || 0,
                            };
                        }
                        return slot;
                    });

                    // Determine which paths need signed URLs (skip cached ones)
                    const pathsToFetch: string[] = [];

                    updatedSlots.forEach(slot => {
                        if (slot.status === 'success' && slot.imagePath) {
                            const cached = getCachedAnswerImageUrl(slot.imagePath);
                            const existingSlot = slotsRef.current.find(s => s.label === slot.label);
                            const isCached = Boolean(cached) ||
                                             (existingSlot?.fileUrl && existingSlot.imagePath === slot.imagePath);
                            if (!isCached) {
                                pathsToFetch.push(slot.imagePath);
                            }
                        }
                    });

                    const signedUrlsMap = await getAnswerImageUrls(pathsToFetch);

                    const resolvedSlots = updatedSlots.map(slot => {
                        if (slot.status === 'success' && slot.imagePath) {
                            const cached = getCachedAnswerImageUrl(slot.imagePath);
                            if (cached) {
                                return { ...slot, fileUrl: cached };
                            }
                            const existingSlot = slotsRef.current.find(s => s.label === slot.label);
                            if (existingSlot?.fileUrl && existingSlot.imagePath === slot.imagePath) {
                                return { ...slot, fileUrl: existingSlot.fileUrl };
                            }
                            const signedUrl = signedUrlsMap.get(slot.imagePath) || null;
                            return { ...slot, fileUrl: signedUrl };
                        }
                        return slot;
                    });

                    // Merge with current slots to preserve local 'uploading' and deleting state
                    setSlots(prevSlots => {
                        return resolvedSlots.map(fetchedSlot => {
                            const currentSlot = prevSlots.find(s => s.label === fetchedSlot.label);
                            if (currentSlot && (currentSlot.status === 'uploading' || isDeletingSlotRef.current === fetchedSlot.label)) {
                                return currentSlot; // Preserve the local state
                            }
                            return fetchedSlot;
                        });
                    });
                } else {
                    setSlots(initialSlots);
                }
            } else {
                submissionVersionRef.current = null;
            }
        } catch (err) {
            logger.error('Error fetching submission details:', err);
        } finally {
            if (activeFetchRef.current === fetchKey) {
                activeFetchRef.current = null;
            }
            logger.debug("[POLL_EXECUTION] loadSubmissionDetails end", Date.now(), `| duration: ${Date.now() - fetchStart}ms`);
        }
    }, [matkulId]);

    useEffect(() => {
        if (authLoading) return;
        if (!authUser) {
            router.push('/login');
            return;
        }

        // Inisialisasi struktur 24 slot lembar kerja kosong
        const initialSlots = generateSlots().map(s => ({
            ...s,
            status: 'empty' as const,
            fileUrl: null
        }));
        setSlots(initialSlots);
        setUserId(authUser.id);

        const initWorkspace = async () => {
            try {
                // Enrollment authorization check
                const { data: enrollmentCheck, error: enrollErr } = await supabase
                    .from('mahasiswa_mata_kuliah')
                    .select('id')
                    .eq('mahasiswa_id', authUser.id)
                    .eq('mata_kuliah_id', matkulId)
                    .maybeSingle();

                if (enrollErr) {
                    logger.error('Error checking enrollment:', enrollErr);
                }

                if (!enrollmentCheck) {
                    logger.warn(`[Access Denied] Student ${authUser.id} is not enrolled in course ${matkulId}`);
                    setIsAccessDenied(true);
                    return;
                }

                // Ambil data mata kuliah dari database
                const { data: course } = await supabase
                    .from('mata_kuliah')
                    .select('nama_matkul, kode_matkul')
                    .eq('id', matkulId)
                    .maybeSingle();

                if (course) {
                    setNamaMatkul(course.nama_matkul);
                    setKodeMatkul(course.kode_matkul || '');
                }

                await loadSubmissionDetails(authUser.id);
            } catch (err) {
                logger.error("Failed to initialize workspace:", err);
            }
        };

        initWorkspace();
    }, [authUser, authLoading, matkulId, router, loadSubmissionDetails]);

    const loadSubmissionDetailsRef = useRef(loadSubmissionDetails);
    useEffect(() => {
        loadSubmissionDetailsRef.current = loadSubmissionDetails;
    }, [loadSubmissionDetails]);

    const pollSubmissionStatus = useCallback(async () => {
        if (!userId || !submissionId || statusFetchRef.current) return;
        statusFetchRef.current = true;
        try {
            const { data, error } = await supabase
                .from('pengumpulan_tugas')
                .select('status_submit, updated_at')
                .eq('id', submissionId)
                .maybeSingle();
            if (error) throw error;
            if (!data) return;

            const version = `${data.status_submit}:${data.updated_at ?? ''}`;
            if (version !== submissionVersionRef.current) {
                await loadSubmissionDetailsRef.current(userId);
            }
        } catch (error) {
            logger.error('Submission status sync failed.', error);
        } finally {
            statusFetchRef.current = false;
        }
    }, [submissionId, userId]);

    useEffect(() => {
        if (!submissionId) return;
        const storedJobId = sessionStorage.getItem(
            `emathtoco:ai-job:${submissionId}`,
        );
        if (storedJobId) {
            setActiveAiJobId(storedJobId);
        }
    }, [submissionId]);

    // Track the exact RQ job returned by auto-run. This gives immediate,
    // terminal feedback while the lightweight Supabase status polling remains
    // as a recovery path after reloads or transient network failures.
    useEffect(() => {
        if (!activeAiJobId || !submissionId) return;

        let stopped = false;
        let attempt = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const delays = [2_000, 3_000, 5_000];

        const clearActiveJob = () => {
            sessionStorage.removeItem(`emathtoco:ai-job:${submissionId}`);
            setActiveAiJobId(null);
        };
        const schedule = () => {
            if (stopped) return;
            const delay = delays[Math.min(attempt, delays.length - 1)];
            attempt += 1;
            timer = setTimeout(poll, delay);
        };
        const poll = async () => {
            if (document.visibilityState === 'hidden') {
                schedule();
                return;
            }
            try {
                const response = await apiGet(`/jobs/${activeAiJobId}`);
                if (response.ok) {
                    const job = await response.json() as {
                        status: 'queued' | 'started' | 'completed' | 'failed';
                        error_code?: string | null;
                        failed?: Record<string, string>;
                    };
                    if (job.status === 'completed' || job.status === 'failed') {
                        stopped = true;
                        clearActiveJob();
                        await pollSubmissionStatus();

                        const submissionError = job.failed?.[submissionId];
                        if (job.status === 'failed' || submissionError) {
                            toast.error(
                                'Penilaian AI Gagal',
                                'Sebagian atau seluruh jawaban tidak dapat diproses.',
                            );
                        } else {
                            toast.success(
                                'Penilaian AI Selesai',
                                'Nilai AI sudah tersedia tanpa perlu memuat ulang halaman.',
                            );
                        }
                        return;
                    }
                }
            } catch (error) {
                logger.warn('AI job status check failed; retrying.', error);
            }
            schedule();
        };

        void poll();
        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
        };
    }, [
        activeAiJobId,
        pollSubmissionStatus,
        submissionId,
        toast,
    ]);

    // Only the tiny parent status row is polled. Answer rows and signed image
    // URLs are refreshed exclusively after the parent version actually changes.
    useEffect(() => {
        const delay = getSubmissionStatusPollDelay(submissionStatus);
        if (!submissionId || delay === null) {
            return;
        }

        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const schedule = () => {
            if (stopped) return;
            timer = setTimeout(run, delay);
        };
        const run = async () => {
            if (document.visibilityState === 'visible') {
                await pollSubmissionStatus();
            }
            schedule();
        };
        schedule();

        return () => {
            stopped = true;
            if (timer) clearTimeout(timer);
        };
    }, [pollSubmissionStatus, submissionId, submissionStatus]);

    // Synchronize on focus/tab visibility change
    useEffect(() => {
        if (!submissionId) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                void pollSubmissionStatus();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [pollSubmissionStatus, submissionId]);

    // Auto scroll/focus to problematic section from hash on load
    useEffect(() => {
        if (slots.length > 0) {
            const hash = window.location.hash;
            if (hash) {
                const targetId = hash.replace('#', '');
                setTimeout(() => {
                    const element = document.getElementById(targetId);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('ring-2', 'ring-amber-500', 'shadow-[0_0_20px_rgba(245,158,11,0.3)]');
                        setTimeout(() => {
                            element.classList.remove('ring-2', 'ring-amber-500', 'shadow-[0_0_20px_rgba(245,158,11,0.3)]');
                        }, 5000);
                    }
                }, 500);
            }
        }
    }, [slots]);

    const handleFileChange = async (label: string, file: File | undefined) => {
        if (!file || !userId) return;

        const rawExtension = file.name.split('.').pop()?.toLowerCase() || '';

        // Task 3: HEIC/HEIF & Unsupported format validation
        if (['heic', 'heif'].includes(rawExtension)) {
            toast.error('Format Tidak Didukung', 'Format HEIC belum didukung. Silakan ubah ke JPG atau PNG terlebih dahulu.');
            return;
        }

        if (!['jpg', 'jpeg', 'png'].includes(rawExtension)) {
            toast.error('Format Tidak Didukung', 'Hanya diperbolehkan mengunggah file JPG, JPEG, atau PNG.');
            return;
        }

        // Client-side file size validation (max 10 MB)
        if (file.size > 10 * 1024 * 1024) {
            toast.error('File Terlalu Besar', 'Ukuran file maksimal yang diperbolehkan adalah 10 MB.');
            return;
        }

        const currentSlot = slots.find(s => s.label === label);
        if (currentSlot && isSlotLocked(currentSlot)) {
            logger.debug('Upload blocked: Slot is locked.');
            return;
        }

        // Real-time status lock check from database (source of truth)
        if (submissionId) {
            try {
                const { data: latestSub, error: subErr } = await supabase
                    .from('pengumpulan_tugas')
                    .select('status_submit')
                    .eq('id', submissionId)
                    .maybeSingle();

                if (subErr) throw subErr;

                if (latestSub) {
                    const lockedStatuses = ['processing_ai', 'ready_review', 'reviewed', 'finalized'];
                    if (lockedStatuses.includes(latestSub.status_submit)) {
                        setSubmissionStatus(latestSub.status_submit);
                        setIsReadOnly(true);
                        loadSubmissionDetails(userId);
                        toast.error('Aksi Ditolak', 'Tugas sedang/sudah diproses oleh AI.');
                        return;
                    }
                }
            } catch (dbCheckErr) {
                logger.error('Realtime status lock check failed:', dbCheckErr);
            }
        }

        // Ubah status komponen kotak slot menjadi Loading/Uploading
        // Generate local preview URL immediately for instant visual feedback
        const localPreviewUrl = URL.createObjectURL(file);
        logger.debug('PREVIEW URL', localPreviewUrl);
        setSlots(prev => prev.map(s => s.label === label ? { ...s, status: 'uploading', localPreviewUrl } : s));
        logger.debug('STATE UPDATED — slot', label, 'set to uploading with local preview');

        try {
            logger.debug('--- STARTING UPLOAD WORKFLOW ---');
            logger.debug('Target Slot Label:', label);
            logger.debug('File details:', { name: file.name, size: file.size, type: file.type });

            // Compress the image before uploading if it is indeed an image file
            let fileToUpload = file;
            if (file.type.startsWith('image/')) {
                try {
                    fileToUpload = await compressImage(file);
                } catch (compressErr) {
                    logger.error('Image compression failed, falling back to original file:', compressErr);
                }
            }

            // 1. VALIDASI AUTH SESSION SEBELUM UPLOAD
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            logger.debug('Session validation check:', {
                hasSession: !!session,
                userId: session?.user?.id,
                userIdState: userId,
                error: sessionError
            });

            if (sessionError || !session) {
                logger.error('Upload blocked: Session validation failed.', sessionError);
                toast.error('Sesi Kedaluwarsa', 'Silakan masuk kembali untuk melanjutkan.');
                router.push('/login');
                setSlots(prev => prev.map(s => s.label === label ? { ...s, status: 'empty', fileUrl: null } : s));
                return;
            }

            // Ambil atau buat row pengumpulan_tugas jika ini upload pertama kali
            let activeSubmissionId = submissionId;
            if (!activeSubmissionId) {
                logger.debug('No existing submissionId found. Creating new pengumpulan_tugas row...');
                const newSub = await createSubmission(matkulId);
                activeSubmissionId = newSub.id;
                setSubmissionId(activeSubmissionId);
                setSubmissionStatus('draft');
                logger.debug('Created parent submission:', newSub);
            }

            const sectionCode = `S-${label.toUpperCase()}`;
            const { imagePath: filePath, signedUrl } = await replaceAnswerImage({
                submissionId: activeSubmissionId,
                userId,
                sectionCode,
                file: fileToUpload,
                createPreviewUrl: getAnswerImageUrl,
            });

            // Perbarui status slot menjadi sukses
            // Revoke the local preview blob URL to free memory
            if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
            setSlots(prev => prev.map(s => s.label === label ? {
                ...s,
                status: 'success',
                fileUrl: signedUrl,
                localPreviewUrl: null,
                imagePath: filePath,
                dbStatus: s.dbStatus === 'reupload_required' ? 'draft' : (s.dbStatus || 'draft'),
                rejectionReason: s.rejectionReason,
                wasReuploaded: s.dbStatus === 'reupload_required' ? true : s.wasReuploaded,
                lastReuploadAt: s.dbStatus === 'reupload_required' ? new Date().toISOString() : s.lastReuploadAt,
                reuploadCount: s.dbStatus === 'reupload_required' ? (s.reuploadCount || 0) + 1 : s.reuploadCount,
            } : s));

            // Trigger upload success animation
            setJustUploadedLabels(prev => [...prev, label]);
            setTimeout(() => {
                setJustUploadedLabels(prev => prev.filter(l => l !== label));
            }, 1000);

            logger.debug('--- UPLOAD WORKFLOW COMPLETED SUCCESSFULLY ---');
        } catch (err) {
            logger.error('CRITICAL: Upload workflow error details:', {
                error: err,
                userId,
                matkulId,
                label,
                submissionId
            });

            toast.error('Gagal Mengunggah', err instanceof Error ? err.message : 'Terjadi kesalahan saat upload.');
            if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
            setSlots(prev => prev.map(s => s.label === label ? { ...s, status: 'error', fileUrl: null, localPreviewUrl: null } : s));
        }
    };

    // AKSI AKHIR: Kirim Transaksi Akhir (Mark status_submit menjadi 'submitted')
    const handleFinalSubmit = async (confirmed = false) => {
        const totalSlots = slots.length;
        const uploadedCount = slots.filter(s => s.status === 'success').length;
        if (uploadedCount < totalSlots) {
            setShowValidationModal(true);
            return;
        }

        if (!confirmed) {
            setShowSubmitConfirmModal(true);
            return;
        }

        const submittableStatuses = ['draft', 'reupload_required', 'failed'];
        if (
            !submissionId
            || isReadOnly
            || (submissionStatus && !submittableStatuses.includes(submissionStatus))
            || isSubmitting
        ) return;

        setIsSubmitting(true);

        try {
            const { data: submitData, error: submitError } = await supabase
                .rpc('submit_submission', {
                    p_submission_id: submissionId,
                });

            if (submitError) throw submitError;

            if (!submitData) {
                throw new Error('Database tidak mengembalikan hasil submit.');
            }

            setSubmissionStatus('submitted');
            setSlots(prev => prev.map(s => s.status === 'success' ? { ...s, dbStatus: 'submitted' } : s));

            // Trigger AI auto-run check on backend (SST configuration)
            try {
                const autoRunRes = await apiPost(`/submission/${submissionId}/submit`);
                if (autoRunRes.ok) {
                    const autoRunData = await autoRunRes.json() as {
                        auto_run?: boolean;
                        job_id?: string | null;
                    };
                    logger.debug('[AI AutoRun] Backend response:', autoRunData);
                    if (autoRunData.auto_run) {
                        if (autoRunData.job_id) {
                            sessionStorage.setItem(
                                `emathtoco:ai-job:${submissionId}`,
                                autoRunData.job_id,
                            );
                            setActiveAiJobId(autoRunData.job_id);
                        }
                        toast.success('AI Dipicu', 'Pipeline evaluasi AI otomatis berjalan.');
                    }
                }
            } catch (autoRunErr) {
                logger.error('[AI AutoRun] Failed to trigger auto-run:', autoRunErr);
            }
        } catch (err) {
            logger.error("FULL ERROR:", err);
            if (typeof err === 'object') {
                logger.debug(JSON.stringify(err, null, 2));
            }
            toast.error(
                'Gagal Mengumpulkan Tugas',
                err instanceof Error ? err.message : 'Terjadi kesalahan. Silakan coba lagi.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteSlot = async (label: string) => {
        if (isDeletingSlot || isSubmitting) return;
        const slot = slots.find(s => s.label === label);
        if (!slot || slot.status !== 'success' || !submissionId) return;
        if (isSlotLocked(slot) || submissionStatus === 'submitted') {
            logger.debug('Delete blocked: Slot is locked or already submitted.');
            toast.error('Aksi Ditolak', 'Jawaban tidak dapat dihapus setelah tugas dikumpulkan.');
            return;
        }

        // Real-time status lock check from database (source of truth)
        try {
            const { data: latestSub, error: subErr } = await supabase
                .from('pengumpulan_tugas')
                .select('status_submit')
                .eq('id', submissionId)
                .maybeSingle();

            if (subErr) throw subErr;

            if (latestSub) {
                const lockedStatuses = ['processing_ai', 'ready_review', 'reviewed', 'finalized'];
                if (lockedStatuses.includes(latestSub.status_submit) || latestSub.status_submit === 'submitted') {
                    setSubmissionStatus(latestSub.status_submit);
                    loadSubmissionDetails(userId || '');
                    toast.error('Aksi Ditolak', 'Jawaban tidak dapat dihapus setelah tugas dikumpulkan.');
                    return;
                }
            }
        } catch (dbCheckErr) {
            logger.error('Realtime status lock check failed:', dbCheckErr);
        }

        setIsDeletingSlot(label);
        try {
            const sectionCode = `S-${label.toUpperCase()}`;
            const { data: deletedPath, error: metadataError } = await supabase
                .rpc('delete_answer_metadata', {
                    p_submission_id: submissionId,
                    p_section_code: sectionCode,
                });
            if (metadataError) throw metadataError;

            if (deletedPath) {
                const { error: storageError } = await supabase.storage
                    .from('lembar-jawaban')
                    .remove([deletedPath as string]);
                if (storageError) {
                    logger.warn('Answer object cleanup deferred.');
                }
            }

            const remainingCount = slots.filter(
                (candidate) => candidate.status === 'success' && candidate.label !== label,
            ).length;
            if (remainingCount === 0) {
                setSubmissionId(null);
                setSubmissionStatus(null);
                setNilaiAkhir(null);
                setModelAi(null);
            }

            setSlots(prev => prev.map(s => s.label === label ? {
                ...s,
                status: 'empty' as const,
                fileUrl: null,
                localPreviewUrl: null,
                imagePath: undefined,
                dbStatus: undefined,
                prediksiAi: undefined,
                feedback: undefined,
                nilaiFinal: null,
                rejectionReason: null,
                wasReuploaded: false,
            } : s));

            // Tutup modal
            setShowChoiceModal(false);
            setPendingUploadLabel(null);
            setActiveUploadChoiceLabel(null);

            toast.success('Foto Dihapus', `Lembar jawaban bagian ${label.toUpperCase()} berhasil dihapus.`);
            logger.debug('[DELETE] Slot', label, 'reset to empty.');
        } catch (err) {
            logger.error('CRITICAL: Delete slot failed:', err);
            toast.error('Gagal Menghapus', err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus foto.');
        } finally {
            setIsDeletingSlot(null);
        }
    };

    const handleSlotTrigger = (slot: SlotState) => {
        if (isSlotLocked(slot)) return;
        const label = slot.label;
        setActiveUploadChoiceLabel(label);
        setPendingUploadLabel(label);
        logger.debug('[SLOT TRIGGER] label:', label, '| isMobile:', isMobile);

        if (isMobile) {
            // On mobile: show the choice modal (Camera / Gallery)
            setShowChoiceModal(true);
        } else {
            // On desktop: directly open file picker (no camera option)
            setTimeout(() => {
                galleryInputRef.current?.click();
            }, 50);
        }
    };

    if (isAccessDenied) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans relative overflow-hidden flex flex-col">
                <Navbar showBack backUrl="/" title="Akses Ditolak" />
                <main className="flex-grow flex items-center justify-center">
                    <div className="text-center max-w-md mx-auto px-6 space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                            <Lock className="w-8 h-8 text-red-400" />
                        </div>
                        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Akses Ditolak</h1>
                        <p className="text-slate-500 dark:text-neutral-400 text-sm">Anda belum terdaftar di mata kuliah ini. Silakan hubungi administrator atau dosen untuk mendapatkan akses.</p>
                        <button
                            onClick={() => router.push('/')}
                            className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white cursor-pointer transition-all hover:from-cyan-400 hover:to-blue-500"
                        >
                            Kembali ke Dashboard
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans pb-24 relative overflow-hidden flex flex-col">
            <ToastContainer toasts={toasts} onRemove={removeToast} />
            {/* Elegant Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            {/* NAVBAR ATAS */}
            <Navbar showBack backUrl="/" title={namaMatkul || 'Lembar Kerja Pengumpulan'} subtitle={kodeMatkul || `Mata Kuliah ID: ${matkulId}`} />

            {/* LAYOUT 24 GRID INTERAKTIF */}
            <main className="max-w-4xl mx-auto px-4 py-8 relative z-10 pb-[calc(8rem+env(safe-area-inset-bottom))] flex-grow w-full">
                {/* WORKFLOW STATUS PANEL */}
                {(() => {
                    const uploadedCount = slots.filter(s => s.status === 'success').length;
                    const totalSlots = slots.length;
                    const uploadPercent = totalSlots > 0 ? Math.round((uploadedCount / totalSlots) * 100) : 0;

                    const getWorkflowInfo = () => {
                        switch (submissionStatus) {
                            case 'submitted':
                                return {
                                    icon: '⏳',
                                    title: 'Tugas Telah Dikumpulkan',
                                    description: 'Menunggu proses AI. Anda masih dapat merevisi jawaban sebelum dosen memulai penilaian.',
                                    accentColor: 'from-amber-500 to-orange-500',
                                    glowColor: 'bg-amber-500/12',
                                };
                            case 'processing_ai':
                                return {
                                    icon: '🤖',
                                    title: 'Sedang Diproses AI',
                                    description: `Lembar jawaban Anda sedang dianalisis menggunakan model ${modelAi || 'DenseNet121'}. Pengeditan tidak diizinkan.`,
                                    accentColor: 'from-purple-500 to-indigo-500',
                                    glowColor: 'bg-purple-500/12',
                                };
                            case 'reviewed':
                                return {
                                    icon: '👨‍🏫',
                                    title: 'Sedang Direview Dosen',
                                    description: 'Hasil analisis AI sedang ditinjau oleh dosen pengampu.',
                                    accentColor: 'from-blue-500 to-cyan-500',
                                    glowColor: 'bg-blue-500/12',
                                };
                            case 'finalized':
                                return {
                                    icon: '🏁',
                                    title: 'Penilaian Selesai',
                                    description: nilaiAkhir != null
                                        ? 'Nilai akhir Anda telah ditetapkan.'
                                        : 'Penilaian telah selesai dilakukan.',
                                    accentColor: 'from-emerald-500 to-teal-500',
                                    glowColor: 'bg-emerald-500/12',
                                };
                            default:
                                if (uploadedCount === totalSlots && totalSlots > 0) {
                                    return {
                                        icon: '✅',
                                        title: 'Siap Dikumpulkan',
                                        description: 'Seluruh 24 slot jawaban telah terisi. Silakan kumpulkan tugas Anda.',
                                        accentColor: 'from-cyan-500 to-blue-500',
                                        glowColor: 'bg-cyan-500/12',
                                    };
                                }
                                return {
                                    icon: '📝',
                                    title: 'Pengisian Lembar Kerja',
                                    description: `Lengkapi berkas jawaban Anda. Terisi ${uploadedCount} dari ${totalSlots} bagian.`,
                                    accentColor: 'from-cyan-500 to-blue-500',
                                    glowColor: 'bg-cyan-500/12',
                                };
                        }
                    };

                    const workflow = getWorkflowInfo();

                    return (
                        <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 backdrop-blur-md rounded-2xl p-6 mb-8 relative overflow-hidden shadow-lg">
                            <div className={`absolute top-0 right-0 w-40 h-40 ${workflow.glowColor} rounded-full blur-3xl pointer-events-none`}></div>

                            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4 mb-5">
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl mt-0.5">{workflow.icon}</span>
                                    <div>
                                        <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">{workflow.title}</h2>
                                        <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1 max-w-md">{workflow.description}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col sm:items-end gap-2 flex-shrink-0">
                                    {submissionStatus === 'finalized' && nilaiAkhir != null ? (
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-3xl font-extrabold text-emerald-400 font-mono">{nilaiAkhir}</span>
                                            <span className="text-xs text-slate-500 dark:text-neutral-500 font-bold uppercase tracking-wider">Nilai Akhir</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col sm:items-end gap-0.5">
                                            <div className="flex items-baseline gap-1.5 justify-end">
                                                <span className="text-3xl font-extrabold text-cyan-400 font-mono">{uploadedCount}</span>
                                                <span className="text-xl font-bold text-slate-400 dark:text-neutral-600">/</span>
                                                <span className="text-xl font-bold text-slate-400 dark:text-neutral-600 font-mono">{totalSlots}</span>
                                            </div>
                                            <span className="text-[10px] text-cyan-500 dark:text-cyan-400 font-mono font-bold uppercase tracking-wider">{uploadPercent}% Terunggah</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="w-full bg-slate-100 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-900 rounded-full h-3 overflow-hidden p-0.5 mb-5">
                                <div
                                    className={`bg-gradient-to-r ${workflow.accentColor} h-full rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(6,182,212,0.5)]`}
                                    style={{ width: `${uploadPercent}%` }}
                                />
                            </div>

                            {/* Workflow Timeline */}
                            <div className="flex items-center justify-between px-1">
                                {[
                                    { key: 'draft', label: 'Upload', icon: '📝' },
                                    { key: 'submitted', label: 'Submitted', icon: '⏳' },
                                    { key: 'processing_ai', label: 'AI Process', icon: '🤖' },
                                    { key: 'reviewed', label: 'Review', icon: '👨‍🏫' },
                                    { key: 'finalized', label: 'Final', icon: '🏁' },
                                ].map((step, i, arr) => {
                                    const statusOrder = ['draft', 'submitted', 'processing_ai', 'reviewed', 'finalized'];
                                    const currentIdx = statusOrder.indexOf(submissionStatus || 'draft');
                                    const stepIdx = statusOrder.indexOf(step.key);
                                    const isCompleted = stepIdx < currentIdx;
                                    const isActive = stepIdx === currentIdx;

                                    return (
                                        <React.Fragment key={step.key}>
                                            <div className="flex flex-col items-center gap-1">
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border transition-all duration-300 ${isCompleted
                                                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                                                    : isActive
                                                        ? 'bg-cyan-500/10 border-cyan-400 text-slate-800 dark:text-white shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                                                        : 'bg-slate-100/50 border-slate-200 dark:bg-neutral-900/50 dark:border-neutral-800 text-slate-400 dark:text-neutral-600'
                                                    }`}>
                                                    {isCompleted ? '✓' : step.icon}
                                                </div>
                                                <span className={`text-[9px] font-semibold uppercase tracking-wider ${isActive ? 'text-cyan-600 dark:text-cyan-400' : isCompleted ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-400 dark:text-neutral-600'
                                                    }`}>{step.label}</span>
                                            </div>
                                            {i < arr.length - 1 && (
                                                <div className={`flex-1 h-px mx-1 transition-all duration-300 ${stepIdx < currentIdx ? 'bg-cyan-500/40' : 'bg-slate-200 dark:bg-neutral-800'
                                                    }`} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* Grouped Questions Sections */}
                <div className="space-y-8">
                    {[1, 2, 3, 4].map((num) => {
                        const questionSlots = slots.filter(s => s.nomor_soal === num);
                        return (
                            <div key={num} className="bg-white dark:bg-[#0A0A0F]/50 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 backdrop-blur-md">
                                <h3 className="text-sm font-bold text-slate-500 dark:text-neutral-400 tracking-widest mb-4 border-b border-slate-100 dark:border-neutral-900/60 pb-2 uppercase">
                                    Soal {num}
                                </h3>
                                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
                                    {questionSlots.map((slot) => {
                                        const isDragOver = dragOverLabel === slot.label;
                                        const locked = isSlotLocked(slot);
                                        const isJustUploaded = justUploadedLabels.includes(slot.label);
                                        return (
                                            <div
                                                key={slot.label}
                                                id={`slot-${slot.label.toLowerCase()}`}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    if (!locked && slot.status !== 'uploading') {
                                                        setDragOverLabel(slot.label);
                                                    }
                                                }}
                                                onDragLeave={() => {
                                                    setDragOverLabel(null);
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setDragOverLabel(null);
                                                    if (!locked && slot.status !== 'uploading' && e.dataTransfer.files?.[0]) {
                                                        setAdjustmentFile(e.dataTransfer.files[0]);
                                                        setAdjustmentLabel(slot.label);
                                                    }
                                                }}
                                                onClick={() => {
                                                    if (slot.status === 'uploading') return;
                                                    if (locked) {
                                                        if (slot.status === 'success') {
                                                            setActiveDetailSlot(slot);
                                                        }
                                                        return;
                                                    }
                                                    handleSlotTrigger(slot);
                                                }}
                                                className={`h-28 sm:h-32 rounded-2xl border relative flex flex-col items-center justify-center p-2 transition-all duration-350 overflow-hidden group ${isJustUploaded ? 'animate-pop-success ' : ''
                                                    } ${slot.status === 'success'
                                                        ? 'border-cyan-500/20 dark:border-cyan-500/20 shadow-md dark:shadow-cyan-500/5 hover:border-cyan-500 dark:hover:border-cyan-500/40 bg-cyan-500/5 dark:bg-cyan-950/5'
                                                        : slot.status === 'uploading'
                                                            ? 'border-cyan-500/60 animate-pulse bg-cyan-500/5 dark:bg-cyan-950/10'
                                                            : slot.status === 'error'
                                                                ? 'border-red-500/30 dark:border-red-500/40 bg-red-500/5 dark:bg-red-950/5 hover:border-red-500'
                                                                : isDragOver
                                                                    ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)] scale-[1.02]'
                                                                    : locked
                                                                        ? 'border-slate-200 dark:border-neutral-900 bg-slate-100 dark:bg-neutral-950/40 cursor-not-allowed opacity-50'
                                                                        : 'bg-white dark:bg-[#0A0A0F]/80 border-slate-200 dark:border-neutral-900 hover:border-blue-500/40 dark:hover:border-cyan-500/40 hover:bg-blue-500/5 dark:hover:bg-cyan-500/5 hover:shadow-[0_0_10px_rgba(59,130,246,0.05)] dark:hover:shadow-[0_0_10px_rgba(6,182,212,0.05)]'
                                                    } ${(!locked && slot.status !== 'uploading') ? 'cursor-pointer select-none active:scale-[0.98]' : ''}`}
                                            >
                                                {/* Reupload Required Overlay Badge */}
                                                {slot.dbStatus === 'reupload_required' && (
                                                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-amber-500/10 dark:bg-amber-950/40 border-2 border-dashed border-amber-500/40 rounded-2xl" title={slot.rejectionReason || 'Upload ulang diperlukan'}>
                                                        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mb-1" />
                                                        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 font-mono text-center px-1">REUPLOAD</span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSlotTrigger(slot);
                                                            }}
                                                            className="mt-1 px-2 py-0.5 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 rounded-md text-[8px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 dark:hover:bg-amber-500/30 transition-colors cursor-pointer"
                                                        >
                                                            Upload Ulang
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Visual state 1: Sukses - Dominant Image Preview */}
                                                {slot.status === 'success' && (
                                                    <div className="absolute inset-0 group/card">
                                                        {/* Dominant Image Preview */}
                                                        <img
                                                            src={slot.fileUrl!}
                                                            alt={`Slot ${slot.label}`}
                                                            loading="lazy"
                                                            decoding="async"
                                                            fetchPriority="low"
                                                            className="w-full h-full object-cover opacity-80 group-hover/card:opacity-100 transition-opacity duration-300"
                                                        />

                                                        {/* Per-Section Status Badge */}
                                                        <div className="absolute top-1.5 right-1.5 z-20 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-cyan-500/20 bg-cyan-950/80 backdrop-blur-sm text-[8px] font-bold text-cyan-400 uppercase tracking-wider">
                                                            <span>✓ Uploaded</span>
                                                        </div>

                                                        {/* Finalized Score Badge */}
                                                        {slot.dbStatus === 'finalized' && slot.nilaiFinal != null && (
                                                            <div className="absolute top-1.5 left-1.5 z-20 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-950/60 backdrop-blur-sm">
                                                                <span className="text-[9px] font-extrabold text-emerald-400 font-mono">{slot.nilaiFinal}</span>
                                                                <span className="text-[7px] text-emerald-500/60 font-bold">/{getMaxScore(slot.label)}</span>
                                                            </div>
                                                        )}

                                                        {/* Hover Overlay Actions (Desktop Only) */}
                                                        {(() => {
                                                            const status = submissionStatus || 'draft';
                                                            const showReplace = status === 'draft' || status === 'submitted' || slot.dbStatus === 'reupload_required';
                                                            const showDelete = status === 'draft';

                                                            if (showReplace || showDelete) {
                                                                return (
                                                                    <div className="absolute inset-0 bg-black/60 opacity-0 md:group-hover/card:opacity-100 transition-all duration-200 hidden md:flex items-center justify-center gap-1.5 z-10">
                                                                        {/* 👁️ View Detail */}
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setActiveDetailSlot(slot);
                                                                            }}
                                                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 border border-white/15 transition-all cursor-pointer"
                                                                            title="Lihat Detail"
                                                                        >
                                                                            <Eye className="w-3.5 h-3.5 text-white" />
                                                                        </button>
                                                                        {/* 📷 Replace Photo */}
                                                                        {showReplace && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    pendingUploadLabelRef.current = slot.label;
                                                                                    setActiveUploadChoiceLabel(slot.label);
                                                                                    setTimeout(() => {
                                                                                        galleryInputRef.current?.click();
                                                                                    }, 50);
                                                                                }}
                                                                                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 border border-white/15 transition-all cursor-pointer"
                                                                                title="Ganti Foto"
                                                                            >
                                                                                <RefreshCw className="w-3.5 h-3.5 text-white" />
                                                                            </button>
                                                                        )}
                                                                        {/* 🗑️ Delete Photo */}
                                                                        {showDelete && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setDesktopDeleteTarget(slot.label);
                                                                                    setShowDesktopDeleteModal(true);
                                                                                }}
                                                                                className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 transition-all cursor-pointer"
                                                                                title="Hapus Foto"
                                                                            >
                                                                                <Trash2 className="w-3.5 h-3.5 text-red-300" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            } else {
                                                                return (
                                                                    <div
                                                                        className="absolute inset-0 opacity-0 md:group-hover/card:opacity-100 transition-all duration-200 hidden md:flex items-center justify-center z-10 cursor-pointer bg-black/40"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setActiveDetailSlot(slot);
                                                                        }}
                                                                    >
                                                                        <Eye className="w-4 h-4 text-white/70" />
                                                                    </div>
                                                                );
                                                            }
                                                        })()}
                                                    </div>
                                                )}

                                                {/* Visual state 2: Sedang Loading Kirim Server — with local preview */}
                                                {slot.status === 'uploading' && (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                        {slot.localPreviewUrl ? (
                                                            <>
                                                                <img src={slot.localPreviewUrl} alt={`Uploading ${slot.label}`} className="w-full h-full object-cover opacity-50" />
                                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                                                                    <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                                                                    <span className="text-[10px] text-white font-mono animate-pulse mt-1">Mengunggah</span>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="flex flex-col items-center justify-center gap-1.5">
                                                                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                                                                <span className="text-[10px] text-cyan-400/80 font-mono animate-pulse">Mengunggah</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Visual state 3: Slot Kosong */}
                                                {slot.status === 'empty' && (
                                                    locked ? (
                                                        <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                                                            <Lock className="w-5 h-5 text-neutral-600 mb-1" />
                                                            <span className="text-[10px] text-neutral-600 font-mono">Terkunci</span>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                                                            <Camera className="w-5 h-5 text-neutral-500 group-hover:text-cyan-400 transition-colors" />
                                                            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-medium transition-colors">Ambil Foto</span>
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-500 font-mono font-bold tracking-wide mt-1">
                                                                Belum Upload
                                                            </span>
                                                        </div>
                                                    )
                                                )}

                                                {/* Visual state 4: Error */}
                                                {slot.status === 'error' && (
                                                    locked ? (
                                                        <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                                                            <AlertTriangle className="w-5 h-5 text-neutral-600 mb-1" />
                                                            <span className="text-[10px] text-neutral-600 font-mono">Gagal</span>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                                                            <AlertTriangle className="w-5 h-5 text-red-400 mb-1" />
                                                            <span className="text-[10px] text-red-400 font-mono font-bold">Gagal. Ulangi</span>
                                                        </div>
                                                    )
                                                )}

                                                {/* Label nomor indeks section soal */}
                                                <span className="absolute bottom-1.5 left-1.5 bg-slate-100 dark:bg-neutral-950/80 border border-slate-200 dark:border-neutral-900 backdrop-blur-sm text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md text-slate-500 dark:text-neutral-400 z-20 uppercase">
                                                    {slot.label.toUpperCase()}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Per-Soal Score Summary (only visible when finalized) */}
                                {submissionStatus === 'finalized' && (() => {
                                    const scored = questionSlots.filter(s => s.nilaiFinal != null);
                                    if (scored.length === 0) return null;
                                    const totalEarned = scored.reduce((sum, s) => sum + (s.nilaiFinal ?? 0), 0);
                                    const totalMax = questionSlots.reduce((sum, s) => sum + getMaxScore(s.label), 0);
                                    const percentage = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
                                    return (
                                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-neutral-800/60">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Trophy className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400/70" />
                                                    <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Total Soal {num}</span>
                                                </div>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-base font-extrabold text-emerald-500 dark:text-emerald-400 font-mono">{totalEarned}</span>
                                                    <span className="text-[10px] text-slate-400 dark:text-neutral-500 font-bold">/ {totalMax}</span>
                                                    <span className="text-[9px] text-slate-500 dark:text-neutral-600 font-mono ml-1">({percentage}%)</span>
                                                </div>
                                            </div>
                                            {/* Mini progress bar */}
                                            <div className="mt-2 w-full bg-slate-100 dark:bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-slate-150 dark:border-transparent">
                                                <div
                                                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })}
                </div>

                {/* Hidden inputs for camera capture & gallery choice */}
                <input
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                        // Use session storage fallback — survives Android background activity recreation/reload
                        const label = getPendingUploadLabel();
                        const files = e.target.files;
                        logger.debug('FILES', files);
                        logger.debug('[CAMERA onChange] pendingLabel:', label, '| files:', files?.length);
                        if (label && files?.[0]) {
                            const file = files[0];
                            logger.debug('FILE', file);
                            setInitialCameraFile(file);
                            setShowCustomCamera(true);
                        }
                        e.target.value = '';
                    }}
                    className="hidden"
                />
                <input
                    type="file"
                    ref={galleryInputRef}
                    accept="image/*"
                    onChange={(e) => {
                        // Use session storage fallback — survives Android background activity recreation/reload
                        const label = getPendingUploadLabel();
                        const files = e.target.files;
                        logger.debug('FILES', files);
                        logger.debug('[GALLERY onChange] pendingLabel:', label, '| files:', files?.length);
                        if (label && files?.[0]) {
                            const file = files[0];
                            logger.debug('FILE', file);
                            setInitialCameraFile(file);
                            setShowCustomCamera(true);
                        }
                        e.target.value = '';
                    }}
                    className="hidden"
                />
            </main>

            {/* FLOATING ACTION BOTTOM BAR */}
            <footer className="fixed bottom-0 left-0 right-0 border-t border-slate-200 dark:border-neutral-900 bg-white/85 dark:bg-[#0A0A0F]/85 backdrop-blur-md pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] px-4 sm:px-6 lg:px-10 z-40">
                {(() => {
                    const uploadedCount = slots.filter(s => s.status === 'success').length;
                    const totalSlots = slots.length;
                    const allUploaded = uploadedCount === totalSlots && totalSlots > 0;

                    const getButtonContent = () => {
                        switch (submissionStatus) {
                            case 'submitted':
                                return {
                                    disabled: true,
                                    text: '✓ TUGAS SUDAH DIKUMPULKAN',
                                    subtext: 'Masih dapat direvisi sebelum diproses AI',
                                    className: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-not-allowed shadow-none'
                                };
                            case 'processing_ai':
                                return {
                                    disabled: true,
                                    text: '🤖 SEDANG DIPROSES AI',
                                    subtext: 'Pengeditan tidak diizinkan',
                                    className: 'bg-purple-500/10 border border-purple-500/20 text-purple-400 cursor-not-allowed shadow-none'
                                };
                            case 'reviewed':
                                return {
                                    disabled: true,
                                    text: '👨‍🏫 SEDANG DIREVIEW DOSEN',
                                    subtext: null,
                                    className: 'bg-blue-500/10 border border-blue-500/20 text-blue-400 cursor-not-allowed shadow-none'
                                };
                            case 'finalized':
                                return {
                                    disabled: true,
                                    text: '🏁 PENILAIAN SELESAI',
                                    subtext: nilaiAkhir != null ? `Nilai Akhir: ${nilaiAkhir}` : null,
                                    className: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-not-allowed shadow-none'
                                };
                            default:
                                return {
                                    disabled: false,
                                    text: allUploaded ? 'KUMPULKAN 24 JAWABAN SEKARANG' : `KUMPULKAN JAWABAN (${uploadedCount}/24)`,
                                    subtext: allUploaded ? null : 'Ada bagian yang belum diunggah',
                                    className: allUploaded
                                        ? 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white shadow-cyan-500/10 cursor-pointer'
                                        : 'bg-slate-100 dark:bg-neutral-900 text-slate-400 dark:text-neutral-500 border border-slate-200 dark:border-neutral-800 shadow-none cursor-pointer hover:bg-slate-200 dark:hover:bg-neutral-800/80 transition-colors'
                                };
                        }
                    };

                    const btn = getButtonContent();

                    return (
                        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="text-center sm:text-left">
                                <p className="text-xs text-slate-400 dark:text-neutral-500 font-bold uppercase tracking-widest">Progress Pengumpulan</p>
                                <p className="text-sm text-slate-700 dark:text-neutral-300 font-mono font-bold mt-1">
                                    {uploadedCount} dari {totalSlots} Bagian Jawaban Terupload
                                </p>
                            </div>
                            <div className="flex flex-col items-center sm:items-end gap-1">
                                <button
                                    onClick={() => handleFinalSubmit(false)}
                                    disabled={btn.disabled || isSubmitting}
                                    className={`w-full sm:w-auto font-extrabold px-8 py-3.5 rounded-xl transition-all duration-300 shadow-lg text-sm tracking-wider active:scale-[0.98] flex items-center justify-center gap-2 ${btn.className}`}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>MEMBUKUKKAN TUGAS...</span>
                                        </>
                                    ) : (
                                        <span>{btn.text}</span>
                                    )}
                                </button>
                                {btn.subtext && (
                                    <span className="text-[10px] text-slate-500 dark:text-neutral-500 font-medium">{btn.subtext}</span>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </footer>

            {/* Detail Modal */}
            {activeDetailSlot && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setActiveDetailSlot(null)}>
                    <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-neutral-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-neutral-900">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Bagian {activeDetailSlot.label.toUpperCase()}</span>
                                {(() => {
                                    const badge = getStatusBadge(activeDetailSlot.dbStatus);
                                    return (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${badge.bg} ${badge.border} ${badge.color}`}>
                                            {badge.icon} {badge.text}
                                        </span>
                                    );
                                })()}
                            </div>
                            <button onClick={() => setActiveDetailSlot(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors cursor-pointer">
                                <X className="w-4 h-4 text-slate-400 dark:text-neutral-400" />
                            </button>
                        </div>

                        {/* Image Preview */}
                        {activeDetailSlot.fileUrl && (
                            <div className="p-4">
                                <img
                                    src={activeDetailSlot.fileUrl}
                                    alt={`Lembar Jawaban ${activeDetailSlot.label}`}
                                    decoding="async"
                                    className="w-full rounded-xl border border-slate-200 dark:border-neutral-800 shadow-md"
                                />
                            </div>
                        )}

                        {/* Rejection Reason — shown when section requires reupload */}
                        {activeDetailSlot.dbStatus === 'reupload_required' && activeDetailSlot.rejectionReason && (
                            <div className="px-5 pb-2">
                                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-250 dark:border-amber-500/20 rounded-xl p-4 space-y-2">
                                    <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                        ⚠ Upload Ulang Diperlukan
                                    </h4>
                                    <p className="text-sm text-amber-700 dark:text-amber-300/80 leading-relaxed">
                                        &quot;{activeDetailSlot.rejectionReason}&quot;
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-neutral-500 mt-1">
                                        Silakan upload ulang jawaban untuk section ini melalui grid upload di atas.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* AI Prediction */}
                        <div className="px-5 pb-4">
                            <div className="bg-slate-50 dark:bg-[#0D0D14] border border-slate-200 dark:border-neutral-900 rounded-xl p-4 space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                                    🤖 Prediksi AI
                                </h4>
                                {activeDetailSlot.prediksiAi ? (
                                    <p className="text-sm text-slate-700 dark:text-neutral-300 leading-relaxed">{activeDetailSlot.prediksiAi}</p>
                                ) : (
                                    <p className="text-xs text-slate-400 dark:text-neutral-600 italic">Belum diproses oleh AI.</p>
                                )}
                            </div>
                        </div>

                        {/* Section Score Card — only when finalized */}
                        {activeDetailSlot.dbStatus === 'finalized' && activeDetailSlot.nilaiFinal != null && (
                            <div className="px-5 pb-4">
                                <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/30 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200 dark:border-emerald-500/15 rounded-xl p-4 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                                    <h4 className="text-xs font-bold text-emerald-600 dark:text-emerald-400/80 uppercase tracking-widest flex items-center gap-2 mb-3">
                                        🏆 Nilai Bagian
                                    </h4>
                                    <div className="flex items-end justify-between">
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-extrabold text-emerald-500 dark:text-emerald-400 font-mono leading-none">
                                                {activeDetailSlot.nilaiFinal}
                                            </span>
                                            <span className="text-lg text-emerald-600 dark:text-emerald-500/40 font-bold font-mono">/</span>
                                            <span className="text-lg text-emerald-600 dark:text-emerald-500/50 font-bold font-mono">
                                                {getMaxScore(activeDetailSlot.label)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-500/60 uppercase tracking-widest">Nilai Final</span>
                                            {/* Visual score bar */}
                                            <div className="w-20 bg-slate-100 dark:bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${Math.round((activeDetailSlot.nilaiFinal / getMaxScore(activeDetailSlot.label)) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Lecturer Feedback */}
                        <div className="px-5 pb-5">
                            <div className="bg-slate-50 dark:bg-[#0D0D14] border border-slate-200 dark:border-neutral-900 rounded-xl p-4 space-y-3">
                                <h4 className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                                    👨‍🏫 Feedback Dosen
                                </h4>
                                {activeDetailSlot.feedback ? (
                                    <p className="text-sm text-slate-700 dark:text-neutral-300 leading-relaxed">{activeDetailSlot.feedback}</p>
                                ) : (
                                    <p className="text-xs text-slate-400 dark:text-neutral-600 italic">Belum ada feedback dari dosen.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop Delete Confirmation Modal */}
            {showDesktopDeleteModal && desktopDeleteTarget && (() => {
                const isDeleting = isDeletingSlot === desktopDeleteTarget;
                return (
                    <div
                        className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
                        onClick={!isDeleting ? () => setShowDesktopDeleteModal(false) : undefined}
                    >
                        <div
                            className="bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Background glow */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />

                            {/* Header */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                                    <Trash2 className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Hapus Foto</h3>
                                    <p className="text-[11px] text-slate-500 dark:text-neutral-500 font-mono">Bagian {desktopDeleteTarget.toUpperCase()}</p>
                                </div>
                            </div>

                            <p className="text-sm text-slate-600 dark:text-neutral-300 leading-relaxed mb-6">
                                Apakah Anda yakin ingin menghapus foto pada bagian ini?{' '}
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                    Tindakan ini akan mengosongkan slot dan mengurangi progres upload.
                                </span>
                            </p>

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button
                                    disabled={isDeleting}
                                    onClick={() => setShowDesktopDeleteModal(false)}
                                    className="flex-1 h-10 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 font-bold rounded-xl transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Batal
                                </button>
                                <button
                                    disabled={isDeleting}
                                    onClick={async () => {
                                        await handleDeleteSlot(desktopDeleteTarget);
                                        setShowDesktopDeleteModal(false);
                                        setDesktopDeleteTarget(null);
                                    }}
                                    className="flex-1 h-10 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors text-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20"
                                >
                                    {isDeleting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Menghapus...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 className="w-4 h-4" />
                                            <span>Hapus</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Validation Modal */}
            {showValidationModal && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowValidationModal(false)}>
                    <div className="bg-white border border-slate-205 dark:bg-[#0A0A0F] dark:border-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl pointer-events-none" />

                        <div className="flex items-center gap-3 mb-4 text-red-500 dark:text-red-400">
                            <AlertTriangle className="w-7 h-7 flex-shrink-0" />
                            <h3 className="text-lg font-bold">Pengumpulan Belum Lengkap</h3>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-neutral-300 mb-5 leading-relaxed">
                            Masih ada lembar jawaban yang belum diunggah.
                        </p>

                        <div className="mb-6 space-y-2">
                            <h4 className="text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-wider">Daftar Bagian Belum Diunggah:</h4>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1.5 bg-slate-50 dark:bg-neutral-950/60 border border-slate-200 dark:border-neutral-850 rounded-xl">
                                {slots.filter(s => s.status !== 'success').map(s => (
                                    <span key={s.label} className="px-2.5 py-1 text-xs font-mono font-bold bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-md uppercase">
                                        {s.label.toUpperCase()}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={() => setShowValidationModal(false)}
                            className="w-full h-11 bg-slate-900 hover:bg-slate-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-sm flex items-center justify-center"
                        >
                            Tutup
                        </button>
                    </div>
                </div>
            )}

            {/* Submit Confirmation Modal */}
            {showSubmitConfirmModal && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowSubmitConfirmModal(false)}>
                    <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-neutral-900 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

                        <div className="flex items-center gap-3 mb-4 text-cyan-500 dark:text-cyan-400">
                            <CheckCircle className="w-7 h-7 flex-shrink-0 animate-bounce" />
                            <h3 className="text-lg font-bold">Konfirmasi Pengumpulan</h3>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-neutral-300 mb-5 leading-relaxed">
                            Apakah Anda yakin ingin mengumpulkan 24 bagian jawaban tugas ini sekarang?
                            <span className="block mt-2 font-semibold text-slate-500 dark:text-neutral-400 text-xs">
                                Catatan: Setelah dikumpulkan, tugas Anda akan langsung diproses oleh sistem AI. Harap periksa kembali untuk memastikan semua foto lembar jawaban sudah benar dan jelas.
                            </span>
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowSubmitConfirmModal(false)}
                                className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-300 font-bold rounded-xl transition-colors text-sm cursor-pointer"
                            >
                                Periksa Lagi
                            </button>
                            <button
                                onClick={async () => {
                                    setShowSubmitConfirmModal(false);
                                    await handleFinalSubmit(true);
                                }}
                                className="flex-1 h-11 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl transition-all text-sm cursor-pointer shadow-lg shadow-cyan-500/20"
                            >
                                Ya, Kumpulkan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Choice Sheet Modal — only shown on mobile devices */}
            {showChoiceModal && activeUploadChoiceLabel && (() => {
                const targetSlot = slots.find(s => s.label === activeUploadChoiceLabel);
                const isUploaded = targetSlot?.status === 'success';
                const isDeleting = isDeletingSlot === activeUploadChoiceLabel;

                const status = submissionStatus || 'draft';
                const showReplace = status === 'draft' || status === 'submitted' || targetSlot?.dbStatus === 'reupload_required';
                const showDelete = status === 'draft';

                const closeModal = () => {
                    setShowChoiceModal(false);
                    // Don't clear activeUploadChoiceLabel here — the ref handles it
                };

                return (
                    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-250" onClick={!isDeleting ? closeModal : undefined}>
                        <div
                            className="bg-white dark:bg-[#0A0A0F] border-t border-slate-200 dark:border-neutral-900 sm:border rounded-t-3xl sm:rounded-2xl max-w-md w-full pt-6 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="w-12 h-1 ml-auto mr-auto bg-slate-200 dark:bg-neutral-800 rounded-full mb-5 sm:hidden" />

                            {isUploaded ? (
                                // ── UPLOADED SLOT: show Ganti / Hapus options ──
                                <>
                                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1 tracking-wide text-center sm:text-left">
                                        Bagian {activeUploadChoiceLabel.toUpperCase()}
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-neutral-500 mb-5 text-center sm:text-left">
                                        Foto sudah diunggah. Pilih tindakan yang ingin dilakukan.
                                    </p>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            disabled={isDeleting}
                                            onClick={() => {
                                                setActiveDetailSlot(targetSlot);
                                                closeModal();
                                                setPendingUploadLabel(null);
                                                setActiveUploadChoiceLabel(null);
                                            }}
                                            className="h-12 border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl font-bold flex items-center justify-center gap-2 text-slate-800 dark:text-white cursor-pointer transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Eye className="w-5 h-5 text-cyan-500" />
                                            <span>Lihat Detail &amp; Hasil AI</span>
                                        </button>

                                        {showReplace && (
                                            <button
                                                disabled={isDeleting}
                                                onClick={() => {
                                                    logger.debug('[GANTI KAMERA BTN] pendingLabel:', getPendingUploadLabel());
                                                    closeModal();
                                                    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
                                                        setShowCustomCamera(true);
                                                    } else {
                                                        toast.info('Beralih ke kamera bawaan sistem.');
                                                        setTimeout(() => {
                                                            cameraInputRef.current?.click();
                                                        }, 100);
                                                    }
                                                }}
                                                className="h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl font-bold flex items-center justify-center gap-2 text-white cursor-pointer shadow-md shadow-cyan-500/10 transition-all active:scale-[0.98] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Camera className="w-5 h-5" />
                                                <span>Ganti Foto (Kamera)</span>
                                            </button>
                                        )}

                                        {showReplace && (
                                            <button
                                                disabled={isDeleting}
                                                onClick={() => {
                                                    logger.debug('[GANTI GALERI BTN] pendingLabel:', getPendingUploadLabel());
                                                    closeModal();
                                                    setTimeout(() => {
                                                        galleryInputRef.current?.click();
                                                    }, 100);
                                                }}
                                                className="h-12 border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl font-bold flex items-center justify-center gap-2 text-slate-800 dark:text-white cursor-pointer transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ImageIcon className="w-5 h-5 text-cyan-500" />
                                                <span>Ganti dari Galeri</span>
                                            </button>
                                        )}

                                        {showDelete && (
                                            <button
                                                disabled={isDeleting}
                                                onClick={() => handleDeleteSlot(activeUploadChoiceLabel)}
                                                className="h-12 border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 dark:border-red-500/30 dark:bg-red-500/5 dark:hover:bg-red-500/10 rounded-xl font-bold flex items-center justify-center gap-2 text-red-600 dark:text-red-400 cursor-pointer transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isDeleting ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                        <span>Menghapus...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Trash2 className="w-5 h-5" />
                                                        <span>Hapus Foto</span>
                                                    </>
                                                )}
                                            </button>
                                        )}

                                        <button
                                            disabled={isDeleting}
                                            onClick={() => {
                                                closeModal();
                                                setPendingUploadLabel(null);
                                                setActiveUploadChoiceLabel(null);
                                            }}
                                            className="h-12 mt-1 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 rounded-xl font-bold text-slate-600 dark:text-neutral-400 cursor-pointer transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Batal
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1 tracking-wide text-center sm:text-left">
                                        Unggah Lembar Jawaban {activeUploadChoiceLabel.toUpperCase()}
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-neutral-500 mb-5 text-center sm:text-left">
                                        Gunakan kamera smartphone atau pilih dari galeri berkas.
                                    </p>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => {
                                                logger.debug("[TRACE] take photo clicked");
                                                logger.debug('[CAMERA BTN] pendingLabel:', getPendingUploadLabel());
                                                closeModal();
                                                if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
                                                    logger.debug("[TRACE] camera modal opened");
                                                    setShowCustomCamera(true);
                                                } else {
                                                    logger.debug("[TRACE] fallback to native camera");
                                                    toast.info('Beralih ke kamera bawaan sistem.');
                                                    setTimeout(() => {
                                                        cameraInputRef.current?.click();
                                                    }, 100);
                                                }
                                            }}
                                            className="h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl font-bold flex items-center justify-center gap-2 text-white cursor-pointer shadow-md shadow-cyan-500/10 transition-all active:scale-[0.98] text-sm"
                                        >
                                            <Camera className="w-5 h-5" />
                                            <span>Ambil Foto (Kamera)</span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                logger.debug('[GALLERY BTN] pendingLabel:', getPendingUploadLabel());
                                                closeModal();
                                                setTimeout(() => {
                                                    galleryInputRef.current?.click();
                                                }, 100);
                                            }}
                                            className="h-12 border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl font-bold flex items-center justify-center gap-2 text-slate-800 dark:text-white cursor-pointer transition-colors text-sm"
                                        >
                                            <ImageIcon className="w-5 h-5 text-cyan-500" />
                                            <span>Pilih dari Galeri</span>
                                        </button>

                                        <button
                                            onClick={() => {
                                                closeModal();
                                                setPendingUploadLabel(null);
                                                setActiveUploadChoiceLabel(null);
                                            }}
                                            className="h-12 mt-1 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 rounded-xl font-bold text-slate-600 dark:text-neutral-400 cursor-pointer transition-colors text-sm"
                                        >
                                            Batal
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

            {showCustomCamera && activeUploadChoiceLabel && (
                <CustomCameraModal
                    label={activeUploadChoiceLabel}
                    initialFile={initialCameraFile || undefined}
                    onCapture={(file) => {
                        setShowCustomCamera(false);
                        setInitialCameraFile(null);
                        setAdjustmentFile(file);
                        setAdjustmentLabel(activeUploadChoiceLabel);
                    }}
                    onClose={() => {
                        setShowCustomCamera(false);
                        setInitialCameraFile(null);
                        setActiveUploadChoiceLabel(null);
                    }}
                    onFallbackToNative={() => {
                        setShowCustomCamera(false);
                        setInitialCameraFile(null);
                        setActiveUploadChoiceLabel(null);
                        toast.info('Beralih ke kamera bawaan sistem.');
                        setTimeout(() => {
                            cameraInputRef.current?.click();
                        }, 100);
                    }}
                />
            )}

            {adjustmentFile && adjustmentLabel && (
                <ImageAdjustmentModal
                    label={adjustmentLabel}
                    file={adjustmentFile}
                    onConfirm={(adjustedFile) => {
                        handleFileChange(adjustmentLabel, adjustedFile);
                        setAdjustmentFile(null);
                        setAdjustmentLabel(null);
                    }}
                    onClose={() => {
                        setAdjustmentFile(null);
                        setAdjustmentLabel(null);
                    }}
                />
            )}
        </div>
        </PageTransition>
    );
}
