'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { UploadCloud, CheckCircle, Loader2, AlertTriangle, Eye, Lock, X, RefreshCw, Trophy, Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/app/hooks/useToast';
import ToastContainer from '@/app/components/Toast';

const getMaxScore = (label: string): number => {
    return label.toLowerCase().endsWith('f') ? 5 : 4;
};

// Membuat daftar 24 kombinasi section section soal (1a - 4f)
const generateSlots = () => {
    const list = [];
    const bagian = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let nomor = 1; nomor <= 4; nomor++) {
        for (let b of bagian) {
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

const createSubmission = async (mahasiswaId: string, mataKuliahId: string) => {
    const { data, error } = await supabase
        .from('pengumpulan_tugas')
        .insert({
            mahasiswa_id: mahasiswaId,
            mata_kuliah_id: mataKuliahId,
            status_submit: 'draft'
        })
        .select()
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Gagal membuat data pengumpulan baru. Baris tidak dikembalikan oleh database.');
    return data;
};

const getSignedPreviewUrl = async (path: string): Promise<string | null> => {
    try {
        const { data, error } = await supabase.storage
            .from('lembar-jawaban')
            .createSignedUrl(path, 3600);
        if (error) throw error;
        return data.signedUrl;
    } catch (err) {
        console.error('Error generating signed URL:', err);
        return null;
    }
};

export default function UploadWorkspace() {
    const router = useRouter();
    const params = useParams();
    const matkulId = params.id as string;

    const [slots, setSlots] = useState<SlotState[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
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
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const { toasts, toast, removeToast } = useToast();

    const [isMobile, setIsMobile] = useState(false);
    const [activeUploadChoiceLabel, setActiveUploadChoiceLabel] = useState<string | null>(null);
    const [showChoiceModal, setShowChoiceModal] = useState(false);
    const [showValidationModal, setShowValidationModal] = useState(false);
    const [justUploadedLabels, setJustUploadedLabels] = useState<string[]>([]);
    const [isDeletingSlot, setIsDeletingSlot] = useState<string | null>(null);
    const [showDesktopDeleteModal, setShowDesktopDeleteModal] = useState(false);
    const [desktopDeleteTarget, setDesktopDeleteTarget] = useState<string | null>(null);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    // Ref to persist the target slot label across async camera/gallery operations
    // This survives React state batching and iOS Safari camera app switching
    const pendingUploadLabelRef = useRef<string | null>(null);

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
        if (isReadOnly && slot.dbStatus !== 'reupload_required') return true;
        const lockedStatuses = ['processing_ai', 'reviewed', 'finalized'];
        if (slot.dbStatus && lockedStatuses.includes(slot.dbStatus)) return true;
        return false;
    };

    useEffect(() => {
        // UA-based mobile detection — reliable for camera vs file picker UX
        const checkMobile = () => {
            const ua = navigator.userAgent || '';
            const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(ua);
            setIsMobile(isMobileDevice);
            console.log('[DEVICE DETECT] UA:', ua, '| isMobile:', isMobileDevice);
        };
        checkMobile();
    }, []);

    useEffect(() => {
        // Inisialisasi struktur 24 slot lembar kerja kosong
        const initialSlots = generateSlots().map(s => ({
            ...s,
            status: 'empty' as const,
            fileUrl: null
        }));
        setSlots(initialSlots);

        // Dapatkan ID pengguna aktif untuk penamaan berkas data riwayat
        supabase.auth.getUser().then(async ({ data: { user } }) => {
            if (user) {
                setUserId(user.id);

                // Cek apakah profil sudah lengkap
                const { data: profile, error } = await supabase
                    .from('profil_pengguna')
                    .select('nama_lengkap')
                    .eq('id', user.id)
                    .maybeSingle();

                console.log("AUTH USER:", user);
                console.log("PROFILE:", profile);
                console.log("PROFILE ERROR:", error);

                if (error) {
                    console.error("Gagal memverifikasi status profil:", error);
                    return;
                }

                if (!profile) {
                    router.push('/complete-profile');
                    return;
                }

                // Enrollment authorization check
                const { data: enrollmentCheck, error: enrollErr } = await supabase
                    .from('mahasiswa_mata_kuliah')
                    .select('id')
                    .eq('mahasiswa_id', user.id)
                    .eq('mata_kuliah_id', matkulId)
                    .maybeSingle();

                if (enrollErr) {
                    console.error('Error checking enrollment:', enrollErr);
                }

                if (!enrollmentCheck) {
                    console.warn(`[Access Denied] Student ${user.id} is not enrolled in course ${matkulId}`);
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

                // Cek data submission yang sudah ada (terbaru)
                const { data: existingSubmission } = await supabase
                    .from('pengumpulan_tugas')
                    .select('*')
                    .eq('mahasiswa_id', user.id)
                    .eq('mata_kuliah_id', matkulId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (existingSubmission) {
                    setSubmissionId(existingSubmission.id);
                    setSubmissionStatus(existingSubmission.status_submit);
                    setNilaiAkhir(existingSubmission.nilai_akhir ?? null);
                    setModelAi(existingSubmission.model_ai ?? null);

                    const lockedStatuses = ['processing_ai', 'reviewed', 'finalized'];
                    if (lockedStatuses.includes(existingSubmission.status_submit)) {
                        setIsReadOnly(true);
                    }

                    // Ambil detail lembar jawaban yang sudah diupload sebelumnya
                    const { data: sheets } = await supabase
                        .from('lembar_jawaban')
                        .select('*')
                        .eq('pengumpulan_tugas_id', existingSubmission.id);

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
                                    prediksiAi: matchedSheet.prediksi_ai || undefined,
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

                        // Ambil signed preview URL untuk render gambar secara paralel
                        const urlPromises = updatedSlots.map(async (slot) => {
                            if (slot.status === 'success' && slot.imagePath) {
                                const signedUrl = await getSignedPreviewUrl(slot.imagePath);
                                if (!signedUrl) {
                                    console.warn(`Storage object missing or invalid for path: ${slot.imagePath}. Cleaning up database...`);

                                    // 6. OPTIONAL AUTO-CLEANUP: delete invalid database row
                                    const sectionCode = `S-${slot.label.toUpperCase()}`;
                                    const matchedSheet = sheets.find(s => s.section_code === sectionCode);
                                    if (matchedSheet) {
                                        supabase
                                            .from('lembar_jawaban')
                                            .delete()
                                            .eq('id', matchedSheet.id)
                                            .then(({ error }) => {
                                                if (error) console.error('Auto-cleanup of orphaned metadata row failed:', error);
                                                else console.log('Successfully auto-cleaned orphaned metadata row for slot:', slot.label);
                                            });
                                    }

                                    // Reset slot state to empty
                                    return {
                                        ...slot,
                                        status: 'empty' as const,
                                        fileUrl: null,
                                        imagePath: undefined,
                                        dbStatus: undefined
                                    };
                                }
                                return { ...slot, fileUrl: signedUrl };
                            }
                            return slot;
                        });

                        const resolvedSlots = await Promise.all(urlPromises);
                        setSlots(resolvedSlots);
                    }
                }
            } else {
                router.push('/login');
            }
        });
    }, [router, matkulId]);

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

    // LOGIKA UTAMA: Upload Gambar Mandiri ke Supabase Storage (Bucket: lembar-jawaban)
    const handleFileChange = async (label: string, file: File | undefined) => {
        if (!file || !userId || isReadOnly) return;

        const currentSlot = slots.find(s => s.label === label);
        if (currentSlot && isSlotLocked(currentSlot)) {
            console.log('Upload blocked: Slot is locked.');
            return;
        }

        // Ubah status komponen kotak slot menjadi Loading/Uploading
        // Generate local preview URL immediately for instant visual feedback
        const localPreviewUrl = URL.createObjectURL(file);
        console.log('PREVIEW URL', localPreviewUrl);
        setSlots(prev => prev.map(s => s.label === label ? { ...s, status: 'uploading', localPreviewUrl } : s));
        console.log('STATE UPDATED — slot', label, 'set to uploading with local preview');

        try {
            console.log('--- STARTING UPLOAD WORKFLOW ---');
            console.log('Target Slot Label:', label);
            console.log('File details:', { name: file.name, size: file.size, type: file.type });

            // 1. VALIDASI AUTH SESSION SEBELUM UPLOAD
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            console.log('Session validation check:', {
                hasSession: !!session,
                userId: session?.user?.id,
                userIdState: userId,
                error: sessionError
            });

            if (sessionError || !session) {
                console.error('Upload blocked: Session validation failed.', sessionError);
                toast.error('Sesi Kedaluwarsa', 'Silakan masuk kembali untuk melanjutkan.');
                router.push('/login');
                setSlots(prev => prev.map(s => s.label === label ? { ...s, status: 'empty', fileUrl: null } : s));
                return;
            }

            // Ambil atau buat row pengumpulan_tugas jika ini upload pertama kali
            let activeSubmissionId = submissionId;
            if (!activeSubmissionId) {
                console.log('No existing submissionId found. Creating new pengumpulan_tugas row...');
                const newSub = await createSubmission(userId, matkulId);
                activeSubmissionId = newSub.id;
                setSubmissionId(activeSubmissionId);
                setSubmissionStatus('draft');
                console.log('Created parent submission:', newSub);
            }

            const sectionCode = `S-${label.toUpperCase()}`;

            // 2. DYNAMIC FILE EXTENSION DETECTION
            const extension = file.name.split('.').pop() || 'jpg';
            // Struktur nama file unik: userId/submissionId/section_code.extension
            const filePath = `${userId}/${activeSubmissionId}/${sectionCode}.${extension}`;

            console.log('Generated upload details:', {
                activeSubmissionId,
                sectionCode,
                extension,
                filePath
            });

            // 3. Upload file ke Storage Bucket Supabase (Private)
            console.log('Uploading file data to storage bucket "lembar-jawaban"...');
            const { data: storageData, error: storageError } = await supabase.storage
                .from('lembar-jawaban')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (storageError) {
                console.error('Supabase Storage Upload Failure:', {
                    error: storageError,
                    filePath,
                    bucket: 'lembar-jawaban'
                });
                throw storageError;
            }
            console.log('Storage upload successful:', storageData);

            // 4. Simpan baris data detail lembar_jawaban (upsert manual aman)
            console.log('Upserting lembar_jawaban metadata row...');
            const { data: existingRow, error: checkError } = await supabase
                .from('lembar_jawaban')
                .select('id')
                .eq('pengumpulan_tugas_id', activeSubmissionId)
                .eq('section_code', sectionCode)
                .maybeSingle();

            if (checkError) {
                console.error('Metadata database check failed:', checkError);
                throw checkError;
            }

            if (existingRow) {
                console.log('Existing row found with ID:', existingRow.id, '. Updating image_url...');
                const updatePayload: Record<string, unknown> = {
                    image_url: filePath,
                    updated_at: new Date().toISOString()
                };
                // If this was a rejected section, reset status and clear rejection
                const currentSlotForUpdate = slots.find(s => s.label === label);
                if (currentSlotForUpdate?.dbStatus === 'reupload_required') {
                    updatePayload.status = 'draft';
                    updatePayload.prediksi_ai = null;
                    updatePayload.nilai_final = null;
                    updatePayload.nilai_dosen = null;
                    updatePayload.was_reuploaded = true;
                    updatePayload.last_reupload_at = new Date().toISOString();
                    updatePayload.reupload_count = (currentSlotForUpdate.reuploadCount || 0) + 1;
                }
                const { error: dbError } = await supabase
                    .from('lembar_jawaban')
                    .update(updatePayload)
                    .eq('id', existingRow.id);

                if (dbError) {
                    console.error('Metadata database update failed:', dbError);
                    throw dbError;
                }
            } else {
                console.log('No existing row found. Inserting new lembar_jawaban metadata...');
                const { error: dbError } = await supabase
                    .from('lembar_jawaban')
                    .insert({
                        pengumpulan_tugas_id: activeSubmissionId,
                        section_code: sectionCode,
                        image_url: filePath,
                        status: 'draft'
                    });

                if (dbError) {
                    console.error('Metadata database insert failed:', dbError);
                    throw dbError;
                }
            }
            console.log('Database metadata successfully persisted.');

            // 5. Ambil signed preview URL
            console.log('Generating signed preview URL for path:', filePath);
            const signedUrl = await getSignedPreviewUrl(filePath);
            if (!signedUrl) {
                throw new Error('Gagal menghasilkan signed URL preview berkas terunggah.');
            }
            console.log('Signed preview URL generated successfully:', signedUrl);

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

            console.log('--- UPLOAD WORKFLOW COMPLETED SUCCESSFULLY ---');
        } catch (err) {
            console.error('CRITICAL: Upload workflow error details:', {
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
    const handleFinalSubmit = async () => {
        const totalSlots = slots.length;
        const uploadedCount = slots.filter(s => s.status === 'success').length;
        if (uploadedCount < totalSlots) {
            setShowValidationModal(true);
            return;
        }

        if (!submissionId || isReadOnly || (submissionStatus && submissionStatus !== 'draft')) return;

        setIsSubmitting(true);

        try {
            // Update status_submit to 'submitted' and verify RLS allows it
            const { data: submitData, error: submitError } = await supabase
                .from('pengumpulan_tugas')
                .update({
                    status_submit: 'submitted',
                    waktu_submit: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', submissionId)
                .select();

            if (submitError) throw submitError;

            if (!submitData || submitData.length === 0) {
                throw new Error('Gagal memperbarui status pengumpulan di database. Rute keamanan (RLS) memblokir aksi ini.');
            }

            // Update all lembar_jawaban statuses to 'submitted' and verify RLS allows it
            const { data: sheetsData, error: sheetsError } = await supabase
                .from('lembar_jawaban')
                .update({ status: 'submitted', updated_at: new Date().toISOString() })
                .eq('pengumpulan_tugas_id', submissionId)
                .select();

            if (sheetsError) throw sheetsError;

            if (!sheetsData || sheetsData.length === 0) {
                throw new Error('Gagal memperbarui status lembar jawaban di database. Rute keamanan (RLS) memblokir aksi ini.');
            }

            setSubmissionStatus('submitted');
            setSlots(prev => prev.map(s => s.status === 'success' ? { ...s, dbStatus: 'submitted' } : s));
        } catch (err) {
            console.error("FULL ERROR:", err);
            if (typeof err === 'object') {
                console.log(JSON.stringify(err, null, 2));
            }
            toast.error(
                'Gagal Mengumpulkan Tugas',
                err instanceof Error ? err.message : 'Terjadi kesalahan. Silakan coba lagi.'
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    // AKSI HAPUS FOTO: Hapus gambar dari storage dan DB, kembalikan slot ke kosong
    const handleDeleteSlot = async (label: string) => {
        const slot = slots.find(s => s.label === label);
        if (!slot || slot.status !== 'success' || !submissionId) return;

        setIsDeletingSlot(label);
        try {
            const sectionCode = `S-${label.toUpperCase()}`;
            const imagePath = slot.imagePath;

            // STEP 1: Hapus dari Supabase Storage terlebih dahulu
            if (imagePath) {
                const { error: storageError } = await supabase.storage
                    .from('lembar-jawaban')
                    .remove([imagePath]);
                if (storageError) {
                    console.error('Storage delete failed:', storageError);
                    throw new Error(`Gagal menghapus foto dari storage: ${storageError.message}`);
                }
                console.log('[DELETE] Storage file removed:', imagePath);
            }

            // STEP 2: Hapus baris lembar_jawaban dari database
            const { error: dbError } = await supabase
                .from('lembar_jawaban')
                .delete()
                .eq('pengumpulan_tugas_id', submissionId)
                .eq('section_code', sectionCode);

            if (dbError) {
                console.error('DB delete failed:', dbError);
                throw new Error(`Gagal menghapus data dari database: ${dbError.message}`);
            }
            console.log('[DELETE] DB row removed for section_code:', sectionCode);

            // STEP 3: Reset slot ke status kosong
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
            pendingUploadLabelRef.current = null;
            setActiveUploadChoiceLabel(null);

            toast.success('Foto Dihapus', `Lembar jawaban bagian ${label.toUpperCase()} berhasil dihapus.`);
            console.log('[DELETE] Slot', label, 'reset to empty.');
        } catch (err) {
            console.error('CRITICAL: Delete slot failed:', err);
            toast.error('Gagal Menghapus', err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus foto.');
        } finally {
            setIsDeletingSlot(null);
        }
    };

    const handleSlotTrigger = (slot: SlotState) => {
        if (isSlotLocked(slot)) return;
        const label = slot.label;
        setActiveUploadChoiceLabel(label);
        pendingUploadLabelRef.current = label;
        console.log('[SLOT TRIGGER] label:', label, '| isMobile:', isMobile);
        
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
            <main className="max-w-4xl mx-auto px-4 py-8 relative z-10 pb-32 flex-grow w-full">
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
                                    description: `Lembar jawaban Anda sedang dianalisis menggunakan model ${modelAi || 'DenseNet'}. Pengeditan tidak diizinkan.`,
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
                                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border transition-all duration-300 ${
                                                    isCompleted
                                                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                                                        : isActive
                                                            ? 'bg-cyan-500/10 border-cyan-400 text-slate-800 dark:text-white shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                                                            : 'bg-slate-100/50 border-slate-200 dark:bg-neutral-900/50 dark:border-neutral-800 text-slate-400 dark:text-neutral-600'
                                                }`}>
                                                    {isCompleted ? '✓' : step.icon}
                                                </div>
                                                <span className={`text-[9px] font-semibold uppercase tracking-wider ${
                                                    isActive ? 'text-cyan-600 dark:text-cyan-400' : isCompleted ? 'text-slate-500 dark:text-neutral-400' : 'text-slate-400 dark:text-neutral-600'
                                                }`}>{step.label}</span>
                                            </div>
                                            {i < arr.length - 1 && (
                                                <div className={`flex-1 h-px mx-1 transition-all duration-300 ${
                                                    stepIdx < currentIdx ? 'bg-cyan-500/40' : 'bg-slate-200 dark:bg-neutral-800'
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
                                                        handleFileChange(slot.label, e.dataTransfer.files[0]);
                                                    }
                                                }}
                                                onClick={() => {
                                                    if (locked || slot.status === 'uploading') return;
                                                    handleSlotTrigger(slot);
                                                }}
                                                className={`h-28 sm:h-32 rounded-2xl border relative flex flex-col items-center justify-center p-2 transition-all duration-350 overflow-hidden group ${
                                                    isJustUploaded ? 'animate-pop-success ' : ''
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
                                                        <img src={slot.fileUrl!} alt={`Slot ${slot.label}`} className="w-full h-full object-cover opacity-80 group-hover/card:opacity-100 transition-opacity duration-300" />

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
                                                        {!locked ? (
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
                                                                {/* 🗑️ Delete Photo */}
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
                                                            </div>
                                                        ) : (
                                                            <div
                                                                className="absolute inset-0 opacity-0 md:group-hover/card:opacity-100 transition-all duration-200 hidden md:flex items-center justify-center z-10 cursor-pointer bg-black/40"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setActiveDetailSlot(slot);
                                                                }}
                                                            >
                                                                <Eye className="w-4 h-4 text-white/70" />
                                                            </div>
                                                        )}
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
                                                            <span className="text-[10px] text-neutral-650 dark:text-neutral-400 font-medium transition-colors">Ambil Foto</span>
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
                        // Use ref — survives iOS Safari camera app switching
                        const label = pendingUploadLabelRef.current;
                        const files = e.target.files;
                        console.log('FILES', files);
                        console.log('[CAMERA onChange] pendingLabel:', label, '| files:', files?.length);
                        if (label && files?.[0]) {
                            const file = files[0];
                            console.log('FILE', file);
                            console.log('PREVIEW CREATED');
                            handleFileChange(label, file);
                            console.log('STATE UPDATED');
                        }
                        e.target.value = '';
                        pendingUploadLabelRef.current = null;
                        setActiveUploadChoiceLabel(null);
                    }}
                    className="hidden"
                />
                <input
                    type="file"
                    ref={galleryInputRef}
                    accept="image/*"
                    onChange={(e) => {
                        // Use ref — survives async file picker
                        const label = pendingUploadLabelRef.current;
                        const files = e.target.files;
                        console.log('FILES', files);
                        console.log('[GALLERY onChange] pendingLabel:', label, '| files:', files?.length);
                        if (label && files?.[0]) {
                            const file = files[0];
                            console.log('FILE', file);
                            console.log('PREVIEW CREATED');
                            handleFileChange(label, file);
                            console.log('STATE UPDATED');
                        }
                        e.target.value = '';
                        pendingUploadLabelRef.current = null;
                        setActiveUploadChoiceLabel(null);
                    }}
                    className="hidden"
                />
            </main>

            {/* FLOATING ACTION BOTTOM BAR */}
            <footer className="fixed bottom-0 left-0 right-0 border-t border-slate-200 dark:border-neutral-900 bg-white/85 dark:bg-[#0A0A0F]/85 backdrop-blur-md py-4 px-4 sm:px-6 lg:px-10 z-40">
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
                                    className: 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white shadow-cyan-500/10 cursor-pointer'
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
                                    onClick={handleFinalSubmit}
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
                                <img src={activeDetailSlot.fileUrl} alt={`Lembar Jawaban ${activeDetailSlot.label}`} className="w-full rounded-xl border border-slate-200 dark:border-neutral-800 shadow-md" />
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

            {/* Mobile Choice Sheet Modal — only shown on mobile devices */}
            {showChoiceModal && activeUploadChoiceLabel && (() => {
                const targetSlot = slots.find(s => s.label === activeUploadChoiceLabel);
                const isUploaded = targetSlot?.status === 'success';
                const isDeleting = isDeletingSlot === activeUploadChoiceLabel;

                const closeModal = () => {
                    setShowChoiceModal(false);
                    // Don't clear activeUploadChoiceLabel here — the ref handles it
                };

                return (
                    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-250" onClick={!isDeleting ? closeModal : undefined}>
                        <div 
                            className="bg-white dark:bg-[#0A0A0F] border-t border-slate-200 dark:border-neutral-900 sm:border rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in slide-in-from-bottom duration-300"
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
                                        {/* 👁️ View Detail */}
                                        <button
                                            disabled={isDeleting}
                                            onClick={() => {
                                                setActiveDetailSlot(targetSlot);
                                                closeModal();
                                                pendingUploadLabelRef.current = null;
                                                setActiveUploadChoiceLabel(null);
                                            }}
                                            className="h-12 border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl font-bold flex items-center justify-center gap-2 text-slate-800 dark:text-white cursor-pointer transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Eye className="w-5 h-5 text-cyan-500" />
                                            <span>Lihat Detail &amp; Hasil AI</span>
                                        </button>

                                        {/* 📷 Ganti Foto — Kamera */}
                                        <button
                                            disabled={isDeleting}
                                            onClick={() => {
                                                console.log('[GANTI KAMERA BTN] pendingLabel:', pendingUploadLabelRef.current);
                                                closeModal();
                                                setTimeout(() => {
                                                    cameraInputRef.current?.click();
                                                }, 100);
                                            }}
                                            className="h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl font-bold flex items-center justify-center gap-2 text-white cursor-pointer shadow-md shadow-cyan-500/10 transition-all active:scale-[0.98] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Camera className="w-5 h-5" />
                                            <span>Ganti Foto (Kamera)</span>
                                        </button>

                                        {/* 🖼️ Ganti dari Galeri */}
                                        <button
                                            disabled={isDeleting}
                                            onClick={() => {
                                                console.log('[GANTI GALERI BTN] pendingLabel:', pendingUploadLabelRef.current);
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

                                        {/* 🗑️ Hapus Foto */}
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

                                        {/* Batal */}
                                        <button
                                            disabled={isDeleting}
                                            onClick={() => {
                                                closeModal();
                                                pendingUploadLabelRef.current = null;
                                                setActiveUploadChoiceLabel(null);
                                            }}
                                            className="h-12 mt-1 bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 rounded-xl font-bold text-slate-600 dark:text-neutral-400 cursor-pointer transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Batal
                                        </button>
                                    </div>
                                </>
                            ) : (
                                // ── EMPTY SLOT: show Ambil Foto / Galeri options ──
                                <>
                                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1 tracking-wide text-center sm:text-left">
                                        Unggah Lembar Jawaban {activeUploadChoiceLabel.toUpperCase()}
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-neutral-500 mb-5 text-center sm:text-left">
                                        Gunakan kamera smartphone atau pilih dari galeri berkas.
                                    </p>

                                    <div className="flex flex-col gap-3">
                                        {/* 📷 Ambil Foto — Kamera */}
                                        <button
                                            onClick={() => {
                                                console.log('[CAMERA BTN] pendingLabel:', pendingUploadLabelRef.current);
                                                closeModal();
                                                setTimeout(() => {
                                                    cameraInputRef.current?.click();
                                                }, 100);
                                            }}
                                            className="h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-xl font-bold flex items-center justify-center gap-2 text-white cursor-pointer shadow-md shadow-cyan-500/10 transition-all active:scale-[0.98] text-sm"
                                        >
                                            <Camera className="w-5 h-5" />
                                            <span>Ambil Foto (Kamera)</span>
                                        </button>

                                        {/* 🖼️ Pilih dari Galeri */}
                                        <button
                                            onClick={() => {
                                                console.log('[GALLERY BTN] pendingLabel:', pendingUploadLabelRef.current);
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

                                        {/* Batal */}
                                        <button
                                            onClick={() => {
                                                closeModal();
                                                pendingUploadLabelRef.current = null;
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
        </div>
    );
}