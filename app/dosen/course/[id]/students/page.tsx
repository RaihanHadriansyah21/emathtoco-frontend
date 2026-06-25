'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
    Users,
    Search,
    ArrowLeft,
    Loader2,
    Lock,
    X,
    CheckCircle,
    AlertCircle,
    Award,
    FileText,
    ExternalLink,
    Mail,
    UserCheck,
    Cpu,
    Calendar,
    ChevronDown,
    Zap,
    GraduationCap,
    Clock
} from 'lucide-react';
import Navbar from '../../../../components/Navbar';
import ToastContainer from '../../../../components/Toast';
import { useToast } from '@/app/hooks/useToast';
import { GlassTable, GlassTableHeader, GlassTableRow, ResponsiveTableWrapper } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { apiGet, apiPost } from '@/lib/api-client';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeIn, modalTransition } from '@/styles/motion';
import PageTransition from '@/components/ui/PageTransition';

import { useAuth } from '@/app/components/AuthGate';

interface StudentProfile {
    id: string;
    nama_lengkap: string;
    nim_nip: string;
    kelas: string;
    foto_profil_url: string | null;
}

interface AnswerSheet {
    id: string;
    status: string;
}

interface Submission {
    id: string;
    mahasiswa_id: string;
    status_submit: 'submitted' | 'processing_ai' | 'reviewed' | 'finalized';
    waktu_submit: string;
    nilai_akhir: number | null;
    ai_status: string | null;
    lembar_jawaban: AnswerSheet[] | null;
}

interface EnrolledStudent {
    id: string;
    nama_lengkap: string;
    nim_nip: string;
    kelas: string;
    foto_profil_url: string | null;
    submission: Submission | null;
}

interface SectionPrediction {
    section_code: string;
    predicted_class?: string;
    predicted_score: number;
    confidence: number;
}

interface PredictionDetails {
    submission_id: string;
    nilai_akhir: number | null;
    ai_status: string | null;
    model_ai: string | null;
    sections: SectionPrediction[];
}

export default function LecturerStudentRoster() {
    const router = useRouter();
    const params = useParams();
    const courseId = params.id as string;
    const { user } = useAuth();

    // Auth & Access Control
    const [isChecking, setIsChecking] = useState(true);
    const [isAccessDenied, setIsAccessDenied] = useState(false);
    const [lecturerName, setLecturerName] = useState('');

    // Course state
    const [courseName, setCourseName] = useState('');
    const [courseCode, setCourseCode] = useState('');

    // Roster data
    const [students, setStudents] = useState<EnrolledStudent[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Search & Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'unsubmitted' | 'submitted' | 'pending_ai' | 'finalized'>('all');

    // Selected Student Modal State
    const [selectedStudent, setSelectedStudent] = useState<EnrolledStudent | null>(null);
    const [predictionDetails, setPredictionDetails] = useState<PredictionDetails | null>(null);
    const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);
    const [predictionError, setPredictionError] = useState<string | null>(null);
    const [isFinalizing, setIsFinalizing] = useState(false);

    // Toast Container
    const { toasts, toast, removeToast } = useToast();

    const fetchRosterData = useCallback(async () => {
        setIsLoadingData(true);
        setErrorMsg(null);

        try {
            const res = await apiGet(`/lecturer/course/${courseId}/students`);
            if (!res.ok) {
                throw new Error('Gagal mengambil data roster dari backend.');
            }

            const data = await res.json();
            if (data.success && data.students) {
                const mapped: EnrolledStudent[] = data.students.map((student: any) => {
                    let sub: Submission | null = null;
                    if (student.submission) {
                        sub = {
                            id: student.submission.id,
                            mahasiswa_id: student.submission.mahasiswa_id,
                            status_submit: student.submission.status_submit,
                            waktu_submit: student.submission.waktu_submit,
                            nilai_akhir: student.submission.nilai_akhir,
                            ai_status: student.submission.ai_status,
                            lembar_jawaban: Array.from({ length: student.submission.sheets_count || 0 }, (_, i) => ({
                                id: String(i),
                                status: 'success'
                            }))
                        };
                    }
                    
                    return {
                        id: student.id,
                        nama_lengkap: student.nama_lengkap,
                        nim_nip: student.nim_nip,
                        kelas: student.kelas,
                        foto_profil_url: student.foto_profil_url,
                        submission: sub
                    };
                });
                setStudents(mapped);
            } else {
                throw new Error('Format data dari backend tidak valid.');
            }
        } catch (err: any) {
            console.error('Error fetching roster data:', err);
            setErrorMsg('Gagal memuat daftar mahasiswa terdaftar dari backend.');
        } finally {
            setIsLoadingData(false);
        }
    }, [courseId]);

    useEffect(() => {
        if (!user) return;

        const verifyAccess = async () => {
            try {
                setLecturerName(user.nama_lengkap);

                // Run course assignment check and course info query concurrently
                const [assignResult, courseResult] = await Promise.all([
                    supabase
                        .from('dosen_mata_kuliah')
                        .select('id')
                        .eq('dosen_id', user.id)
                        .eq('mata_kuliah_id', courseId)
                        .maybeSingle(),
                    supabase
                        .from('mata_kuliah')
                        .select('nama_matkul, kode_matkul')
                        .eq('id', courseId)
                        .maybeSingle()
                ]);

                if (assignResult.error || !assignResult.data) {
                    setIsAccessDenied(true);
                    setIsChecking(false);
                    return;
                }

                if (courseResult.data) {
                    setCourseName(courseResult.data.nama_matkul);
                    setCourseCode(courseResult.data.kode_matkul);
                }

                setIsChecking(false);
                fetchRosterData();
            } catch (err) {
                console.error('Roster verification error:', err);
                setErrorMsg('Terjadi kesalahan saat memeriksa akses kelas.');
                setIsChecking(false);
            }
        };

        verifyAccess();
    }, [user, courseId, fetchRosterData]);



    // Handle student row click to load predictions and display modal
    const handleOpenModal = async (student: EnrolledStudent) => {
        setSelectedStudent(student);
        setPredictionDetails(null);
        setPredictionError(null);

        if (!student.submission) {
            return;
        }

        setIsLoadingPrediction(true);
        try {
            const res = await apiGet(`/prediction/${student.submission.id}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedStudent(current => {
                    if (current?.id === student.id) {
                        setPredictionDetails(data);
                    }
                    return current;
                });
            } else {
                setSelectedStudent(current => {
                    if (current?.id === student.id) {
                        setPredictionError('Gagal mengambil detail penilaian AI dari backend.');
                    }
                    return current;
                });
            }
        } catch (err) {
            console.error('Failed to load predictions:', err);
            setSelectedStudent(current => {
                if (current?.id === student.id) {
                    setPredictionError('Backend AI tidak dapat dihubungi.');
                }
                return current;
            });
        } finally {
            setIsLoadingPrediction(false);
        }
    };

    // Finalize submission directly from modal
    const handleFinalizeSubmission = async (submissionId: string) => {
        if (isFinalizing) return;
        setIsFinalizing(true);

        try {
            // 1. Fetch current final score (sum of sheet scores or finalized overall score)
            let overallScore = 0;
            const sub = selectedStudent?.submission;
            if (predictionDetails) {
                overallScore = predictionDetails.sections.reduce((acc, s) => acc + (s.predicted_score || 0), 0);
            } else if (sub && sub.nilai_akhir !== null && sub.nilai_akhir !== undefined) {
                overallScore = sub.nilai_akhir;
            }

            // 2. Update status of lembar_jawaban to 'finalized'
            const { error: sheetError } = await supabase
                .from('lembar_jawaban')
                .update({
                    status: 'finalized',
                    updated_at: new Date().toISOString()
                })
                .eq('pengumpulan_tugas_id', submissionId);

            if (sheetError) throw sheetError;

            // 3. Update pengumpulan_tugas status to finalized
            const { error: subError } = await supabase
                .from('pengumpulan_tugas')
                .update({
                    status_submit: 'finalized',
                    ai_status: 'finalized', // Satisfy chk_status_sync check constraint
                    nilai_akhir: overallScore,
                    updated_at: new Date().toISOString()
                })
                .eq('id', submissionId);

            if (subError) throw subError;

            // 4. Send finalize trigger to backend API
            try {
                await apiPost(`/submission/${submissionId}/finalize`);
            } catch (apiErr) {
                console.warn('API finalize update failed, but DB update succeeded:', apiErr);
            }

            // Log Audit
            try {
                await apiPost('/audit/log', {
                    action: 'FINAL_SCORE_SUBMITTED',
                    target: 'pengumpulan_tugas',
                    details: { new_score: overallScore, source: 'roster_modal' }
                });
            } catch (_) {}

            toast.success('Sukses', 'Penilaian tugas berhasil difinalisasi!');

            // Refresh modal state & parent table data
            if (predictionDetails) {
                setPredictionDetails(prev => prev ? { ...prev, ai_status: 'finalized' } : null);
            }
            if (selectedStudent) {
                setSelectedStudent(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        submission: prev.submission ? {
                            ...prev.submission,
                            status_submit: 'finalized',
                            ai_status: 'finalized',
                            nilai_akhir: overallScore
                        } : null
                    };
                });
            }

            fetchRosterData();
        } catch (err) {
            console.error('Failed to finalize submission:', err);
            toast.error('Error', 'Gagal memfinalisasi penilaian tugas.');
        } finally {
            setIsFinalizing(false);
        }
    };

    // Calculate Summary Stats
    const totalCount = students.length;
    const submittedCount = students.filter(s => s.submission !== null).length;
    const unsubmittedCount = totalCount - submittedCount;
    const gradedCount = students.filter(s => s.submission && ['completed', 'reviewed', 'finalized'].includes(s.submission.ai_status || '')).length;
    const pendingGradingCount = students.filter(s => s.submission && (!s.submission.ai_status || s.submission.ai_status === 'pending' || s.submission.ai_status === 'processing')).length;

    // Filter Logic
    const filteredStudents = students.filter(student => {
        const nameMatch = student.nama_lengkap.toLowerCase().includes(searchQuery.toLowerCase());
        const nimMatch = student.nim_nip.toLowerCase().includes(searchQuery.toLowerCase());
        const searchMatches = nameMatch || nimMatch;

        if (!searchMatches) return false;

        switch (filterStatus) {
            case 'unsubmitted':
                return student.submission === null;
            case 'submitted':
                return student.submission !== null;
            case 'pending_ai':
                return student.submission !== null && (!student.submission.ai_status || student.submission.ai_status === 'pending' || student.submission.ai_status === 'processing');
            case 'finalized':
                return student.submission?.status_submit === 'finalized';
            default:
                return true;
        }
    });

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    };

    const formatDate = (isoString: string) => {
        if (!isoString) return '-';
        const date = new Date(isoString);
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusBadge = (submission: Submission | null) => {
        if (!submission) {
            return { icon: '❌', text: 'Belum Kumpul', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' };
        }

        const aiStatus = submission.ai_status || 'pending';
        const submitStatus = submission.status_submit;

        if (submitStatus === 'finalized' || aiStatus === 'finalized') {
            return { icon: '🏁', text: 'Finalized', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
        }

        switch (aiStatus) {
            case 'processing':
                return { icon: '🤖', text: 'Diproses AI', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
            case 'completed':
                return { icon: '👨‍🏫', text: 'Siap Review', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
            case 'reviewed':
                return { icon: '👨‍🏫', text: 'Direview', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' };
            default:
                return { icon: '⏳', text: 'Menunggu AI', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
        }
    };

    if (isChecking) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
                    <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memverifikasi hak akses...</p>
                </div>
            </div>
        );
    }

    if (isAccessDenied) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans flex flex-col justify-between">
                <Navbar showBack backUrl="/dosen" title="Akses Ditolak" />
                <main className="flex-grow flex items-center justify-center">
                    <div className="text-center max-w-md mx-auto px-6 space-y-4">
                        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                            <Lock className="w-8 h-8 text-red-400" />
                        </div>
                        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Akses Roster Ditolak</h1>
                        <p className="text-slate-500 dark:text-neutral-400 text-sm">Anda tidak ditugaskan ke mata kuliah ini. Silakan hubungi administrator.</p>
                        <button
                            onClick={() => router.push('/dosen')}
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
            <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans pb-16 relative overflow-hidden flex flex-col">
            <ToastContainer toasts={toasts} onRemove={removeToast} />

            {/* Background Glows */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/8 rounded-full blur-[120px] animate-float-blue"></div>
                <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/8 rounded-full blur-[130px] animate-float-purple"></div>
            </div>

            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10 w-full flex-grow">
                {/* Header Section */}
                <div className="mb-8 flex items-start gap-4">
                    <button
                        onClick={() => router.push(`/dosen/course/${courseId}`)}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-[#0A0A0F]/80 dark:border-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-950 dark:hover:text-white transition-all cursor-pointer shadow-sm flex items-center justify-center flex-shrink-0"
                        title="Kembali ke Detail Mata Kuliah"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <Users className="w-6 h-6 text-cyan-500" />
                            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Mahasiswa Terdaftar</h1>
                        </div>
                        <p className="text-slate-500 dark:text-neutral-400 mt-1">
                            Mata Kuliah: <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{courseName || 'Memuat...'}</span> {courseCode ? `(${courseCode})` : ''}
                        </p>
                    </div>
                </div>

                {/* SUMMARY STATS BAR */}
                <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                    {[
                        { label: 'Total Mahasiswa', val: totalCount, icon: '👥', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-cyan-500/10 dark:to-blue-500/5', border: 'border-slate-200 dark:border-cyan-500/10' },
                        { label: 'Sudah Mengumpulkan', val: submittedCount, icon: '✅', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-emerald-500/10 dark:to-teal-500/5', border: 'border-slate-200 dark:border-emerald-500/10' },
                        { label: 'Belum Mengumpulkan', val: unsubmittedCount, icon: '❌', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-red-500/10 dark:to-orange-500/5', border: 'border-slate-200 dark:border-red-500/10' },
                        { label: 'Sudah Dinilai AI', val: gradedCount, icon: '🤖', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-purple-500/10 dark:to-indigo-500/5', border: 'border-slate-200 dark:border-purple-500/10' },
                        { label: 'Menunggu Penilaian', val: pendingGradingCount, icon: '⏳', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-amber-500/10 dark:to-orange-500/5', border: 'border-slate-200 dark:border-amber-500/10' }
                    ].map((card, idx) => (
                        <div
                            key={idx}
                            className={`${card.color} border ${card.border} backdrop-blur-md rounded-2xl p-4 shadow-lg flex flex-col justify-between transition-all duration-300`}
                        >
                            <div className="flex flex-col gap-1.5 items-start">
                                <span className="text-xl">{card.icon}</span>
                                <span className="text-[10px] font-extrabold text-slate-500 dark:text-neutral-400 uppercase tracking-wider leading-tight">{card.label}</span>
                            </div>
                            <span className="text-2xl font-extrabold text-slate-800 dark:text-white mt-3 font-mono">{card.val}</span>
                        </div>
                    ))}
                </div>

                {/* SEARCH AND FILTER WORKBAR */}
                <div className="bg-white/95 dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 sm:p-5 mb-8 backdrop-blur-md flex flex-col sm:flex-row gap-4 shadow-lg">
                    {/* Search Input */}
                    <div className="relative flex-grow">
                        <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-600" />
                        <input
                            type="text"
                            placeholder="Cari mahasiswa berdasarkan nama atau NIM..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 dark:focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 dark:focus:ring-cyan-500/10 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                        />
                    </div>

                    {/* Filter Dropdown */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as any)}
                        className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-900 rounded-xl py-3 px-4 text-sm text-slate-700 dark:text-neutral-350 focus:outline-none focus:border-cyan-500/60 cursor-pointer"
                    >
                        <option value="all">Semua Status</option>
                        <option value="unsubmitted">Belum Mengumpulkan</option>
                        <option value="submitted">Sudah Mengumpulkan</option>
                        <option value="pending_ai">Menunggu AI</option>
                        <option value="finalized">Finalized</option>
                    </select>
                </div>

                {/* TABLE OF STUDENTS */}
                {isLoadingData ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/40 dark:bg-[#0A0A0F]/20 border border-slate-200 dark:border-neutral-950 rounded-2xl gap-3">
                        <Loader2 className="w-8 h-8 text-cyan-600 dark:text-cyan-400 animate-spin" />
                        <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memuat roster mahasiswa...</p>
                    </div>
                ) : errorMsg ? (
                    <div className="bg-red-950/20 border border-red-900/50 text-red-400 p-5 rounded-2xl text-sm flex flex-col gap-2">
                        <p className="font-semibold">{errorMsg}</p>
                        <button onClick={() => fetchRosterData()} className="w-fit text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">Coba Lagi</button>
                    </div>
                ) : filteredStudents.length === 0 ? (
                    <div className="text-center py-20 bg-white dark:bg-[#0A0A0F]/30 border border-slate-200 dark:border-neutral-900/50 rounded-2xl">
                        <p className="text-slate-500 dark:text-neutral-400 text-sm">Tidak ada data mahasiswa yang cocok dengan kriteria.</p>
                    </div>
                ) : (
                    <ResponsiveTableWrapper className="bg-white dark:bg-[#0A0A0F]/80 shadow-xl">
                        <GlassTable className="min-w-[950px]">
                            <GlassTableHeader>
                                <tr>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 whitespace-nowrap w-[40px]">Foto</th>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 whitespace-nowrap">Mahasiswa</th>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 whitespace-nowrap">Kelas</th>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 text-center whitespace-nowrap">Status Submit</th>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 text-center whitespace-nowrap">Lembar Upload</th>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 text-center whitespace-nowrap">Nilai Final</th>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 whitespace-nowrap">Waktu Submit</th>
                                    <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 text-right whitespace-nowrap">Aksi</th>
                                </tr>
                            </GlassTableHeader>
                            <tbody>
                                {filteredStudents.map((student) => {
                                    const statusBadge = getStatusBadge(student.submission);
                                    const sheetsUploaded = student.submission?.lembar_jawaban?.length || 0;

                                    return (
                                        <GlassTableRow key={student.id} onClick={() => handleOpenModal(student)} hoverable={true}>
                                            {/* Profile Photo */}
                                            <td className="py-4 px-6 whitespace-nowrap">
                                                {student.foto_profil_url ? (
                                                    <img
                                                        src={student.foto_profil_url}
                                                        alt={student.nama_lengkap}
                                                        className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-neutral-800"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center font-bold text-cyan-400 text-xs tracking-wider font-mono">
                                                        {getInitials(student.nama_lengkap)}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Profile Details */}
                                            <td className="py-4 px-6 whitespace-nowrap">
                                                <div className="text-sm font-semibold text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors duration-200">{student.nama_lengkap}</div>
                                                <div className="text-xs text-slate-500 dark:text-neutral-400 font-mono mt-0.5">NIM: {student.nim_nip}</div>
                                            </td>

                                            {/* Class */}
                                            <td className="py-4 px-6 text-sm font-semibold text-slate-700 dark:text-neutral-350 whitespace-nowrap">{student.kelas}</td>

                                            {/* Submission Status */}
                                            <td className="py-4 px-6 text-center whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${statusBadge.bg} ${statusBadge.border} ${statusBadge.color}`}>
                                                    <span>{statusBadge.icon}</span>
                                                    <span>{statusBadge.text}</span>
                                                </span>
                                            </td>

                                            {/* Sheets uploaded */}
                                            <td className="py-4 px-6 text-center whitespace-nowrap">
                                                {student.submission ? (
                                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold">
                                                        <span className={sheetsUploaded === 24 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-neutral-400'}>{sheetsUploaded}</span>
                                                        <span className="text-slate-300 dark:text-neutral-600">/</span>
                                                        <span className="text-slate-400 dark:text-neutral-500">24</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 dark:text-neutral-600 font-mono text-sm">-</span>
                                                )}
                                            </td>

                                            {/* Final Score */}
                                            <td className="py-4 px-6 text-center whitespace-nowrap">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold ${student.submission?.nilai_akhir !== null ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-neutral-600'}`}>
                                                    {student.submission?.nilai_akhir !== null ? `${student.submission?.nilai_akhir} / 100` : '-'}
                                                </div>
                                            </td>

                                            {/* Date submitted */}
                                            <td className="py-4 px-6 text-xs text-slate-500 dark:text-neutral-400 font-medium whitespace-nowrap">
                                                {student.submission ? formatDate(student.submission.waktu_submit) : '-'}
                                            </td>

                                            {/* Actions */}
                                            <td className="py-4 px-6 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleOpenModal(student)}
                                                    className="inline-flex items-center bg-gradient-to-r from-slate-100 to-slate-200 dark:from-neutral-950 dark:to-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-800 dark:text-neutral-300 px-3.5 py-2 rounded-xl text-xs font-bold tracking-wider hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all cursor-pointer"
                                                >
                                                    <span>DETAIL</span>
                                                </button>
                                            </td>
                                        </GlassTableRow>
                                    );
                                })}
                            </tbody>
                        </GlassTable>
                    </ResponsiveTableWrapper>
                )}

                {/* STUDENT DETAIL MODAL */}
                <AnimatePresence>
                    {selectedStudent && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            {/* Background Overlay */}
                            <motion.div
                                variants={fadeIn}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                                onClick={() => setSelectedStudent(null)}
                            />
    
                            {/* Modal Box */}
                            <motion.div
                                variants={modalTransition}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                className="relative bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-neutral-800 rounded-3xl w-full max-w-4xl shadow-[0_0_60px_rgba(6,182,212,0.06)] overflow-hidden flex flex-col max-h-[85vh] z-10"
                            >
                                {/* Modal Header */}
                            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-neutral-900/80">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
                                        <Users className="w-5 h-5 text-cyan-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Detail Mahasiswa</h2>
                                        <p className="text-[11px] text-slate-500 dark:text-neutral-500 font-mono tracking-wider mt-0.5 uppercase">ROSTER MANAGER • {courseCode}</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedStudent(null)} className="text-slate-400 dark:text-neutral-550 hover:text-slate-700 dark:hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 cursor-pointer">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-6 overflow-y-auto space-y-6 flex-grow">
                                {/* SECTION 1 & SECTION 2: PROFILE & ACTIVITY GRID */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {/* Section 1: Profile Mahasiswa */}
                                    <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 flex items-start gap-4">
                                        {selectedStudent.foto_profil_url ? (
                                            <img
                                                src={selectedStudent.foto_profil_url}
                                                alt={selectedStudent.nama_lengkap}
                                                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-neutral-800"
                                            />
                                        ) : (
                                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center font-extrabold text-cyan-400 text-lg tracking-wider font-mono flex-shrink-0">
                                                {getInitials(selectedStudent.nama_lengkap)}
                                            </div>
                                        )}
                                        <div className="space-y-1.5 min-w-0">
                                            <h3 className="font-extrabold text-slate-900 dark:text-white text-base truncate">{selectedStudent.nama_lengkap}</h3>
                                            <p className="text-xs font-semibold text-slate-600 dark:text-neutral-400">Kelas: <span className="text-slate-800 dark:text-neutral-200 font-mono">{selectedStudent.kelas}</span></p>
                                            <p className="text-xs font-semibold text-slate-600 dark:text-neutral-400">NIM: <span className="text-slate-800 dark:text-neutral-200 font-mono">{selectedStudent.nim_nip}</span></p>
                                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-500 min-w-0">
                                                <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span className="truncate">{selectedStudent.nim_nip}@student.kampus.ac.id</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 2: Aktivitas Pengumpulan */}
                                    <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 flex flex-col justify-between">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-widest">Status Tugas</span>
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getStatusBadge(selectedStudent.submission).bg} ${getStatusBadge(selectedStudent.submission).border} ${getStatusBadge(selectedStudent.submission).color}`}>
                                                    <span>{getStatusBadge(selectedStudent.submission).text}</span>
                                                </span>
                                            </div>
                                            {selectedStudent.submission && (
                                                <>
                                                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-neutral-350">
                                                        <Calendar className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                                                        <span>Dikumpulkan: <strong className="font-semibold text-slate-900 dark:text-white">{formatDate(selectedStudent.submission.waktu_submit)}</strong></span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-neutral-350">
                                                        <FileText className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                                                        <span>Lembar diunggah: <strong className="font-bold text-cyan-500">{selectedStudent.submission.lembar_jawaban?.length || 0} / 24</strong></span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        {!selectedStudent.submission && (
                                            <div className="text-red-400 text-xs flex items-center gap-1.5 mt-4">
                                                <AlertCircle className="w-4 h-4" />
                                                <span>Mahasiswa bersangkutan belum mengumpulkan lembar jawaban sama sekali.</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* SECTION 3: HASIL PENILAIAN AI */}
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-widest border-b border-slate-100 dark:border-neutral-900 pb-2">Hasil Penilaian AI & Detail Section</h4>

                                    {isLoadingPrediction ? (
                                        <div className="flex items-center justify-center py-10 gap-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-neutral-900/50 rounded-2xl">
                                            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                                            <span className="text-xs text-slate-500 dark:text-neutral-450 animate-pulse">Memuat hasil prediksi AI...</span>
                                        </div>
                                    ) : predictionError ? (
                                        <div className="bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-xs flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                            <span>{predictionError}</span>
                                        </div>
                                    ) : predictionDetails ? (
                                        <div className="space-y-4">
                                            {/* Summary stats of AI process */}
                                            <div className="flex items-center gap-4 bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-xs flex-wrap justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Cpu className="w-4 h-4 text-purple-400" />
                                                    <span>Model: <strong className="font-bold text-purple-400 uppercase">{predictionDetails.model_ai || 'MobileNetV2'}</strong></span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Award className="w-4 h-4 text-purple-400" />
                                                    <span>Nilai Total AI: <strong className="font-extrabold text-purple-400 font-mono text-sm">{predictionDetails.nilai_akhir !== null ? `${predictionDetails.nilai_akhir} / 100` : '-'}</strong></span>
                                                </div>
                                            </div>

                                            {/* 24 Section grid view */}
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
                                                {predictionDetails.sections.map((sec) => {
                                                    const cleanLabel = sec.section_code.replace('S-', '');
                                                    return (
                                                        <div
                                                            key={sec.section_code}
                                                            className="bg-slate-50 border border-slate-200 dark:bg-black/50 dark:border-neutral-900 rounded-xl p-2.5 text-center flex flex-col justify-between hover:border-purple-500/30 transition-colors"
                                                        >
                                                            <div className="text-[10px] font-mono font-bold text-slate-400 dark:text-neutral-500">{cleanLabel}</div>
                                                            <div className="text-lg font-extrabold text-purple-600 dark:text-purple-400 font-mono my-0.5">{sec.predicted_score}</div>
                                                            <div className="text-[9px] font-mono text-slate-500 dark:text-neutral-550 leading-tight">
                                                                Keyakinan: {Math.round(sec.confidence * 100)}% (uncalibrated)
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {predictionDetails.sections.length === 0 && (
                                                    <div className="col-span-full py-4 text-center text-xs text-slate-500 dark:text-neutral-550">Tidak ada lembar jawaban terprediksi untuk tugas ini.</div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 bg-slate-50 dark:bg-black/25 border border-slate-200 dark:border-neutral-900/50 rounded-2xl text-xs text-slate-500 dark:text-neutral-500">
                                            Tugas belum mengaktifkan/menyelesaikan prediksi AI.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer (Aksi Dosen) */}
                            <div className="px-6 py-4 border-t border-slate-100 dark:border-neutral-900 bg-slate-50 dark:bg-black/60 flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
                                <div>
                                    {selectedStudent.submission && (
                                        <span className="text-[10px] font-mono font-bold text-slate-450 dark:text-neutral-500 uppercase tracking-wider block">
                                            ID: {selectedStudent.submission.id}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3">
                                    {selectedStudent.submission && (
                                        <>
                                            {/* Link to Review Workspace page */}
                                            <button
                                                onClick={() => {
                                                    setSelectedStudent(null);
                                                    router.push(`/dosen/review/${selectedStudent.submission?.id}`);
                                                }}
                                                className="inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 dark:bg-neutral-950 dark:border-neutral-900 hover:border-cyan-500/40 text-slate-700 dark:text-neutral-300 hover:text-cyan-600 dark:hover:text-cyan-400 px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer"
                                            >
                                                <span>BUKA WORKSPACE REVIEW</span>
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </button>

                                            {/* Finalize Button */}
                                            {selectedStudent.submission.status_submit !== 'finalized' && selectedStudent.submission.ai_status !== 'finalized' && (
                                                <button
                                                    onClick={() => handleFinalizeSubmission(selectedStudent.submission!.id)}
                                                    disabled={isFinalizing || (predictionDetails === null && !predictionError)}
                                                    className="inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer shadow-lg shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isFinalizing ? (
                                                        <>
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            <span>FINALISASI...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle className="w-3.5 h-3.5 animate-pulse" />
                                                            <span>FINALISASI NILAI</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </>
                                    )}
                                    <button
                                        onClick={() => setSelectedStudent(null)}
                                        className="bg-slate-200 dark:bg-neutral-900 border border-slate-350 dark:border-neutral-800 text-slate-800 dark:text-neutral-400 hover:bg-slate-300 dark:hover:bg-neutral-850 px-5 py-3 rounded-xl text-xs font-bold tracking-wider transition-all cursor-pointer text-center"
                                    >
                                        TUTUP
                                    </button>
                                </div>
                            </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </main>
        </div>
        </PageTransition>
    );
}
