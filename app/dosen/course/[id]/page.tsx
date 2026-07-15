'use client';

import { logger } from '@/lib/logger';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Search, Loader2, ArrowLeft, ArrowRight, Cpu, Download, FileSpreadsheet, Lock, ChevronDown, Users, QrCode, Copy, X, BookOpen } from 'lucide-react';
import { GlassTable, GlassTableHeader, GlassTableRow, ResponsiveTableWrapper } from '@/components/ui/table';
import Navbar from '../../../components/Navbar';
import PageTransition from '@/components/ui/PageTransition';
import BatchAIModal from '../../../components/BatchAIModal';
import ExportCSVModal from '../../../components/ExportCSVModal';
import ToastContainer from '../../../components/Toast';
import { useToast } from '@/app/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { apiGet } from '@/lib/api-client';
import { createJoinToken, sha256Hex } from '@/lib/join-token';

import { useAuth } from '@/app/components/AuthGate';

interface StudentProfile {
  nama_lengkap: string;
  kelas: string;
  nim_nip: string;
}

interface Course {
  nama_matkul: string;
  kode_matkul: string;
}

interface AnswerSheet {
  id: string;
  status: string;
}

interface Submission {
  id: string;
  status_submit: 'submitted' | 'processing_ai' | 'reviewed' | 'finalized' | 'reupload_required';
  waktu_submit: string;
  nilai_akhir: number | null;
  model_ai: string | null;
  mata_kuliah_id: string | null;
  ai_status: string | null;
  mahasiswa: StudentProfile | null;
  mata_kuliah: Course | null;
  lembar_jawaban: AnswerSheet[] | null;
}

interface JoinQrState {
  sessionId: string;
  token: string;
  link: string;
  qrDataUrl: string;
  expiresAt: string;
  maxUses: number | null;
}

interface ClassJoinSessionUpdatePayload {
  new: {
    revoked?: boolean;
    max_uses: number | null;
    current_uses: number | null;
  };
}

export default function LecturerCoursePortal() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  const { user } = useAuth();
  
  // Auth state
  const [isChecking, setIsChecking] = useState(true);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [lecturerName, setLecturerName] = useState('');

  // Course Details State
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [totalStudents, setTotalStudents] = useState<number | null>(null);

  // Data state
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Batch AI Modal state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showJoinQrModal, setShowJoinQrModal] = useState(false);
  const [joinQr, setJoinQr] = useState<JoinQrState | null>(null);
  const [isLoadingJoinQr, setIsLoadingJoinQr] = useState(false);
  const [joinDurationMinutes, setJoinDurationMinutes] = useState('30');
  const [joinMaxUses, setJoinMaxUses] = useState('60');
  const [isCreatingJoinQr, setIsCreatingJoinQr] = useState(false);
  const [isRevokingJoinQr, setIsRevokingJoinQr] = useState(false);
  const { toasts, toast, removeToast } = useToast();

  const isBatchEligibleSubmission = (submission: Submission) => {
    const answerCount = submission.lembar_jawaban?.length ?? 0;
    return (
      submission.status_submit !== 'finalized' &&
      submission.status_submit !== 'reupload_required' &&
      submission.ai_status !== 'finalized' &&
      submission.ai_status !== 'processing' &&
      answerCount >= 24
    );
  };

  // Polling ref to prevent duplicate intervals (BUG 2 fix)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Export dropdown state and ref
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchSubmissions = useCallback(async () => {
    // Prevent overlapping fetches (BUG 2 fix)
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    setIsLoadingData(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('pengumpulan_tugas')
        .select(`
          id,
          status_submit,
          waktu_submit,
          nilai_akhir,
          model_ai,
          mata_kuliah_id,
          ai_status,
          mahasiswa:profil_pengguna!pengumpulan_tugas_mahasiswa_id_fkey(
            nama_lengkap,
            kelas,
            nim_nip
          ),
          mata_kuliah(
            nama_matkul,
            kode_matkul
          ),
          lembar_jawaban(
            id,
            status
          )
        `)
        .in('status_submit', ['submitted', 'processing_ai', 'reviewed', 'finalized'])
        .eq('mata_kuliah_id', courseId);

      if (error) throw error;

      setSubmissions((data as unknown as Submission[]) || []);
    } catch (err) {
      logger.error('Error fetching submissions:', err);
      setErrorMsg('Gagal mengambil data pengumpulan tugas mahasiswa.');
    } finally {
      setIsLoadingData(false);
      isFetchingRef.current = false;
    }
  }, [courseId]);

  // Load active QR join session from database so it persists across modal close/reopen
  const loadActiveJoinSession = useCallback(async () => {
    setIsLoadingJoinQr(true);
    try {
      const { data: sessions, error } = await supabase
        .from('class_join_sessions')
        .select('id, token_raw, expires_at, max_uses, current_uses')
        .eq('course_id', courseId)
        .eq('revoked', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (sessions && sessions.length > 0) {
        const session = sessions[0];
        if (session.token_raw) {
          const link = `${window.location.origin}/join-class?token=${encodeURIComponent(session.token_raw)}`;
          const qrDataUrl = await QRCode.toDataURL(link, {
            width: 300,
            margin: 2,
            color: { dark: '#020617', light: '#ffffff' },
          });
          setJoinQr({
            sessionId: session.id,
            token: session.token_raw,
            link,
            qrDataUrl,
            expiresAt: session.expires_at,
            maxUses: session.max_uses,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to load active join session:', err);
    } finally {
      setIsLoadingJoinQr(false);
    }
  }, [courseId]);

  // Real-time tracking of active QR session (expired / limit reached / revoked)
  useEffect(() => {
    if (!joinQr) return;

    // 1. Timer countdown untuk memantau waktu expired
    const checkExpiryInterval = setInterval(() => {
      const isExpired = new Date(joinQr.expiresAt).getTime() <= Date.now();
      if (isExpired) {
        clearInterval(checkExpiryInterval);
        toast.info('QR Kadaluarsa', 'Waktu berlaku QR join kelas telah habis.');
        setJoinQr(null);
        setShowJoinQrModal(false);
      }
    }, 1000);

    // 2. Supabase Realtime Subscription untuk memantau limit scan / revoked dari db
    const channel = supabase
      .channel(`active_qr_session_${joinQr.sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'class_join_sessions',
          filter: `id=eq.${joinQr.sessionId}`
        },
        (payload: ClassJoinSessionUpdatePayload) => {
          const updatedSession = payload.new;
          if (updatedSession) {
            // Jika status revoked berubah menjadi true
            if (updatedSession.revoked) {
              toast.info('QR Dicabut', 'Sesi QR join kelas telah dinonaktifkan.');
              setJoinQr(null);
              setShowJoinQrModal(false);
              return;
            }
            
            // Jika limit scan tercapai
            const maxUses = updatedSession.max_uses;
            const currentUses = updatedSession.current_uses ?? 0;
            if (maxUses !== null && currentUses >= maxUses) {
              toast.info('Limit Tercapai', 'Kuota maksimal scan QR join kelas telah terpenuhi.');
              
              // Panggil RPC revoke untuk mengamankan data
              supabase.rpc('revoke_class_join_session', {
                p_join_session_id: joinQr.sessionId
              }).then(({ error: rpcErr }) => {
                if (rpcErr) logger.error("Auto-revoke failed:", rpcErr);
              });

              setJoinQr(null);
              setShowJoinQrModal(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(checkExpiryInterval);
      supabase.removeChannel(channel);
    };
  }, [joinQr, toast]);

  useEffect(() => {
    if (!user) return;

    const verifyAccess = async () => {
      try {
        setLecturerName(user.nama_lengkap);

        // Authorization check: Verify lecturer is assigned to this course
        const { data: assignmentCheck, error: checkErr } = await supabase
          .from('dosen_mata_kuliah')
          .select('id')
          .eq('dosen_id', user.id)
          .eq('mata_kuliah_id', courseId)
          .maybeSingle();

        if (checkErr || !assignmentCheck) {
          logger.warn(`[Access Denied] Lecturer ${user.id} is not assigned to course ${courseId}`);
          setIsAccessDenied(true);
          setIsChecking(false);
          setIsLoadingData(false);
          return;
        }

        // Authorized! Disable page loader immediately
        setIsChecking(false);

        // Fetch course details, statistics, and submissions in parallel
        Promise.all([
          Promise.resolve(
            supabase
              .from('mata_kuliah')
              .select('nama_matkul, kode_matkul')
              .eq('id', courseId)
              .maybeSingle()
          )
            .then(({ data: courseInfo }) => {
              if (courseInfo) {
                setCourseName(courseInfo.nama_matkul);
                setCourseCode(courseInfo.kode_matkul);
              }
            })
            .catch((err: unknown) => {
              logger.error("Error loading course details:", err);
            }),
          apiGet(`/lecturer/course/${courseId}/stats`)
            .then(async (statsRes) => {
              if (statsRes.ok) {
                const statsData = await statsRes.json();
                setTotalStudents(statsData.total_students);
              } else {
                throw new Error("Stats API returned non-200");
              }
            })
            .catch((err: unknown) => {
              logger.error("AI Backend Error - Gagal memuat statistik mahasiswa:", err);
              const userFriendlyMsg = (err instanceof TypeError || (err instanceof Error && err.message.includes("fetch")))
                ? "Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan dan IP backend benar."
                : "Gagal memuat statistik mahasiswa.";
              toast.error("Gagal", userFriendlyMsg);
            }),
          fetchSubmissions(),
          loadActiveJoinSession()
        ]);
      } catch (err) {
        logger.error('Dosen verification error:', err);
        setErrorMsg('Terjadi kesalahan saat memeriksa akses kelas.');
        setIsChecking(false);
        setIsLoadingData(false);
      }
    };
    verifyAccess();
  }, [user, courseId, fetchSubmissions, loadActiveJoinSession, toast]);
 
  // Polling logic when any submission is 'processing' (BUG 2 fix)
  useEffect(() => {
    const hasProcessing = submissions.some(s => s.ai_status === 'processing');

    if (!hasProcessing) {
      // Stop polling when nothing is processing
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Only create a new interval if one doesn't already exist
    if (pollingRef.current) return;

    // EGRESS FIX: Poll every 15 seconds (was 3s — 5× reduction in Supabase API calls).
    pollingRef.current = setInterval(() => {
      // Prevent overlapping fetches
      if (isFetchingRef.current) return;
      fetchSubmissions();
    }, 15000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [submissions, fetchSubmissions]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);



  // BUG 1 fix: Open model selection modal instead of running directly
  const handleRunAIBatch = async () => {
    const eligible = submissions.filter(isBatchEligibleSubmission);
    if (eligible.length === 0) {
      toast.info('Info', 'Tidak ada pengumpulan tugas yang siap diproses AI. Finalized, re-upload, processing, atau jawaban belum lengkap otomatis dilewati.');
      return;
    }
    setShowBatchModal(true);
  };

  const handleCreateJoinQr = async () => {
    if (isCreatingJoinQr) return;
    setIsCreatingJoinQr(true);

    const durationNum = Number(joinDurationMinutes);
    if (isNaN(durationNum) || durationNum < 5) {
      toast.error('Validasi Gagal', 'Durasi minimal QR join kelas adalah 5 menit.');
      setIsCreatingJoinQr(false);
      return;
    }

    try {
      const duration = Math.min(durationNum, 24 * 60);
      const parsedMaxUses = Number(joinMaxUses);
      const maxUses = Number.isFinite(parsedMaxUses) && parsedMaxUses > 0
        ? Math.min(Math.floor(parsedMaxUses), 500)
        : null;
      const token = createJoinToken();
      const tokenHash = await sha256Hex(token);
      const link = `${window.location.origin}/join-class?token=${encodeURIComponent(token)}`;
      const expiresAt = new Date(Date.now() + duration * 60_000).toISOString();

      const { data, error } = await supabase.rpc('create_class_join_session', {
        p_course_id: courseId,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_max_uses: maxUses,
        p_token_raw: token,
      });

      if (error) throw error;

      const qrDataUrl = await QRCode.toDataURL(link, {
        width: 300,
        margin: 2,
        color: {
          dark: '#020617',
          light: '#ffffff',
        },
      });

      setJoinQr({
        sessionId: data.id,
        token,
        link,
        qrDataUrl,
        expiresAt: data.expires_at ?? expiresAt,
        maxUses,
      });
      toast.success('QR aktif', 'QR join kelas berhasil dibuat.');
    } catch (err) {
      logger.error('Failed to create class join QR:', err);
      toast.error('Gagal', 'QR join kelas gagal dibuat. Pastikan migration database sudah diterapkan.');
    } finally {
      setIsCreatingJoinQr(false);
    }
  };

  const handleCopyJoinLink = async () => {
    if (!joinQr) return;
    try {
      await navigator.clipboard.writeText(joinQr.link);
      toast.success('Disalin', 'Link join kelas sudah disalin.');
    } catch {
      toast.error('Gagal', 'Browser tidak mengizinkan clipboard. Salin link secara manual.');
    }
  };

  const handleRevokeJoinQr = async () => {
    if (!joinQr || isRevokingJoinQr) return;
    setIsRevokingJoinQr(true);

    try {
      const { error } = await supabase.rpc('revoke_class_join_session', {
        p_join_session_id: joinQr.sessionId,
      });
      if (error) throw error;
      setJoinQr(null);
      toast.success('QR dicabut', 'QR join kelas sudah dinonaktifkan.');
    } catch (err) {
      logger.error('Failed to revoke class join QR:', err);
      toast.error('Gagal', 'QR join kelas gagal dinonaktifkan.');
    } finally {
      setIsRevokingJoinQr(false);
    }
  };

  // Helper to format date
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

  // Status Badge configurations
  const getStatusBadge = (aiStatus: string | null) => {
    const status = aiStatus || 'pending';
    switch (status) {
      case 'pending':
        return { icon: '⏳', text: 'Menunggu AI', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
      case 'processing':
        return { icon: '🤖', text: 'Diproses AI', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
      case 'completed':
        return { icon: '👨‍🏫', text: 'Siap Direview', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
      case 'reviewed':
        return { icon: '👨‍🏫', text: 'Direview Dosen', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' };
      case 'finalized':
        return { icon: '🏁', text: 'Finalized', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
      default:
        return { icon: '⏳', text: 'Menunggu AI', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    }
  };

  // Counters
  const counts = {
    total: submissions.length,
    pending: submissions.filter(s => !s.ai_status || s.ai_status === 'pending').length,
    processing: submissions.filter(s => s.ai_status === 'processing').length,
    completed: submissions.filter(s => s.ai_status === 'completed').length,
    reviewed: submissions.filter(s => s.ai_status === 'reviewed').length,
    finalized: submissions.filter(s => s.ai_status === 'finalized').length,
  };
  const batchEligibleCount = submissions.filter(isBatchEligibleSubmission).length;

  // Filters logic
  const filteredSubmissions = submissions.filter(s => {
    const mhs = Array.isArray(s.mahasiswa) ? s.mahasiswa[0] : s.mahasiswa;
    const mk = Array.isArray(s.mata_kuliah) ? s.mata_kuliah[0] : s.mata_kuliah;
    const studentName = mhs?.nama_lengkap?.toLowerCase() || '';
    const studentNim = mhs?.nim_nip?.toLowerCase() || '';
    const matkulName = mk?.nama_matkul?.toLowerCase() || '';
    const matchesSearch = studentName.includes(searchQuery.toLowerCase()) || 
                          studentNim.includes(searchQuery.toLowerCase()) ||
                          matkulName.includes(searchQuery.toLowerCase());
    
    const matchesStatus = selectedStatus === 'all' || 
                          (selectedStatus === 'pending' && (!s.ai_status || s.ai_status === 'pending')) ||
                          s.ai_status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });


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
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans relative overflow-hidden flex flex-col">
        <Navbar showBack backUrl="/dosen" title="Akses Ditolak" />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Akses Ditolak</h1>
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
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Batch AI Modal */}
      <BatchAIModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        submissions={submissions.map(s => {
          const mhs = Array.isArray(s.mahasiswa) ? s.mahasiswa[0] : s.mahasiswa;
          return {
            id: s.id,
            status_submit: s.status_submit,
            ai_status: s.ai_status,
            lembar_jawaban: s.lembar_jawaban,
            mahasiswa: mhs ? { nama_lengkap: mhs.nama_lengkap, nim_nip: mhs.nim_nip } : null,
          };
        })}
        onComplete={() => fetchSubmissions()}
        onToast={(type, title, message) => toast[type](title, message)}
      />

      {/* Export CSV/Excel Modal */}
      <ExportCSVModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        submissions={submissions.map(s => {
          const mhs = Array.isArray(s.mahasiswa) ? s.mahasiswa[0] : s.mahasiswa;
          const mk = Array.isArray(s.mata_kuliah) ? s.mata_kuliah[0] : s.mata_kuliah;
          return {
            id: s.id,
            status_submit: s.status_submit,
            model_ai: s.model_ai,
            mata_kuliah_id: s.mata_kuliah_id || undefined,
            mahasiswa: mhs ? { kelas: mhs.kelas } : null,
            mata_kuliah: mk ? { nama_matkul: mk.nama_matkul, kode_matkul: mk.kode_matkul } : null,
          };
        })}
        onToast={(type, title, message) => toast[type](title, message)}
      />

      {showJoinQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default"
            aria-label="Tutup modal QR join kelas"
            onClick={() => setShowJoinQrModal(false)}
          />

          <div className="relative w-full max-w-2xl bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-neutral-800 rounded-3xl shadow-[0_0_60px_rgba(6,182,212,0.08)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-neutral-900">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">QR Join Kelas</h2>
                  <p className="text-[11px] text-slate-500 dark:text-neutral-500 font-mono uppercase tracking-wider">
                    {courseCode || 'COURSE'} • token dibatasi waktu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowJoinQrModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:text-neutral-500 dark:hover:text-white dark:hover:bg-neutral-900 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6">
              <div className="space-y-4">
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs leading-relaxed text-slate-600 dark:text-neutral-300">
                  Tampilkan QR ini di awal kelas. Mahasiswa scan, login sebagai mahasiswa, lalu otomatis masuk ke mata kuliah ini. Setelah waktu habis atau QR dicabut, token tidak bisa dipakai lagi.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-500">Berlaku menit</span>
                    <input
                      type="number"
                      min={5}
                      max={1440}
                      value={joinDurationMinutes}
                      onChange={(event) => setJoinDurationMinutes(event.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-500">Maksimal scan</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={joinMaxUses}
                      onChange={(event) => setJoinMaxUses(event.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleCreateJoinQr}
                  disabled={isCreatingJoinQr}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingJoinQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                  <span>{isCreatingJoinQr ? 'MEMBUAT QR...' : 'BUAT QR BARU'}</span>
                </button>

                {joinQr && (
                  <div className="rounded-2xl border border-slate-200 dark:border-neutral-900 bg-slate-50 dark:bg-black/40 p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-neutral-500">Kadaluarsa</span>
                        <span className="font-mono text-slate-800 dark:text-neutral-200">{formatDate(joinQr.expiresAt)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-neutral-500">Limit scan</span>
                        <span className="font-mono text-slate-800 dark:text-neutral-200">{joinQr.maxUses ?? 'Tidak dibatasi'}</span>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-neutral-950 border border-slate-200 dark:border-neutral-900 p-3 text-[11px] font-mono text-slate-600 dark:text-neutral-400 break-all">
                      {joinQr.link}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleCopyJoinLink}
                        className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-cyan-500/40 dark:bg-neutral-950 dark:border-neutral-900 text-slate-700 dark:text-neutral-300 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        SALIN LINK
                      </button>
                      <button
                        type="button"
                        onClick={handleRevokeJoinQr}
                        disabled={isRevokingJoinQr}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/25 hover:bg-red-500/15 text-red-500 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRevokingJoinQr ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        CABUT QR
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center">
                <div className="w-full aspect-square max-w-[220px] rounded-3xl border border-slate-200 dark:border-neutral-900 bg-white p-4 flex items-center justify-center">
                  {isLoadingJoinQr ? (
                    <div className="text-center text-slate-400 dark:text-neutral-500 space-y-2">
                      <Loader2 className="w-10 h-10 mx-auto animate-spin text-cyan-500" />
                      <p className="text-xs font-semibold">Memuat QR aktif...</p>
                    </div>
                  ) : joinQr ? (
                    <img src={joinQr.qrDataUrl} alt="QR join kelas" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center text-slate-400 dark:text-neutral-600 space-y-2">
                      <QrCode className="w-12 h-12 mx-auto" />
                      <p className="text-xs font-semibold">QR akan muncul setelah dibuat.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/8 rounded-full blur-[120px] animate-float-blue"></div>
        <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/8 rounded-full blur-[130px] animate-float-purple"></div>
      </div>

      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative z-10 w-full flex-grow">
        {/* Back navigation and Welcome message */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <button
              onClick={() => router.push('/dosen')}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-[#0A0A0F]/80 dark:border-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-950 dark:hover:text-white transition-all cursor-pointer shadow-sm flex items-center justify-center flex-shrink-0"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Portal Penilaian AI</h1>
              <p className="text-slate-500 dark:text-neutral-400 mt-1 text-sm">
                Mata Kuliah: <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{courseName || 'Memuat...'}</span> {courseCode ? `(${courseCode})` : ''} • Halo Dosen <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{lecturerName}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto self-start sm:self-center">
            <button
              onClick={() => setShowJoinQrModal(true)}
              className="flex items-center justify-center gap-2.5 bg-cyan-500/10 border border-cyan-500/35 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99] w-full sm:w-auto"
            >
              <QrCode className="w-4 h-4 text-cyan-500" />
              <span>QR JOIN KELAS</span>
            </button>
            <button
              onClick={() => router.push(`/dosen/course/${courseId}/questions`)}
              className="flex items-center justify-center gap-2.5 bg-indigo-500/10 border border-indigo-500/35 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99] w-full sm:w-auto"
            >
              <BookOpen className="w-4 h-4 text-indigo-500" />
              <span>KELOLA SOAL</span>
            </button>
            <button
              onClick={() => router.push(`/dosen/course/${courseId}/students`)}
              className="flex items-center justify-center gap-2.5 bg-cyan-500/10 border border-cyan-500/35 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99] w-full sm:w-auto"
            >
              <Users className="w-4 h-4 text-cyan-500" />
              <span>MAHASISWA TERDAFTAR</span>
            </button>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
          {[
            { label: 'Total Pengumpulan', val: counts.total, icon: '📊', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-cyan-500/10 dark:to-blue-500/5', border: 'border-slate-200 dark:border-cyan-500/10 dark:hover:border-cyan-500/25' },
            { label: 'Mahasiswa Terdaftar', val: totalStudents !== null ? totalStudents : '-', icon: '👥', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-teal-500/10 dark:to-emerald-500/5', border: 'border-slate-200 dark:border-teal-500/10 dark:hover:border-teal-500/25' },
            { label: 'Menunggu AI', val: counts.pending, icon: '⏳', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-amber-500/10 dark:to-orange-500/5', border: 'border-slate-200 dark:border-amber-500/10 dark:hover:border-amber-500/25' },
            { label: 'Diproses AI', val: counts.processing, icon: '🤖', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-purple-500/10 dark:to-indigo-500/5', border: 'border-slate-200 dark:border-purple-500/10 dark:hover:border-purple-500/25' },
            { label: 'Siap Review', val: counts.completed, icon: '👨‍🏫', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-blue-500/10 dark:to-indigo-500/5', border: 'border-slate-200 dark:border-blue-500/10 dark:hover:border-blue-500/25' },
            { label: 'Direview Dosen', val: counts.reviewed, icon: '👨‍🏫', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-indigo-500/10 dark:to-blue-500/5', border: 'border-slate-200 dark:border-indigo-500/10 dark:hover:border-indigo-500/25' },
            { label: 'Finalized', val: counts.finalized, icon: '🏁', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-emerald-500/10 dark:to-teal-500/5', border: 'border-slate-200 dark:border-emerald-500/10 dark:hover:border-emerald-500/25' }
          ].map((card, idx) => (
            <div
              key={idx}
              className={`${card.color} border ${card.border} backdrop-blur-md rounded-2xl pt-3.5 pb-3 px-3.5 shadow-lg flex flex-col justify-between transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(6,182,212,0.08)] ${idx === 6 ? 'col-span-1 min-[360px]:col-span-2 lg:col-span-1' : ''}`}
            >
              <div className="flex flex-col gap-1.5 items-start">
                <span className="text-xl">{card.icon}</span>
                <span className="text-[10px] font-extrabold text-slate-500 dark:text-neutral-400 uppercase tracking-wider leading-tight">{card.label}</span>
              </div>
              <span className="text-2xl font-extrabold text-slate-800 dark:text-white mt-3 font-mono">{card.val}</span>
            </div>
          ))}
        </div>

        {/* SEARCH AND FILTERS */}
        <div className="relative z-20 bg-white/90 dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 sm:p-5 mb-6 backdrop-blur-md flex flex-col gap-4 shadow-lg">
          {/* Segmented Status Tabs */}
          <div 
            className="flex items-center gap-1.5 overflow-x-auto w-full pb-1.5 flex-nowrap border-b border-slate-100 dark:border-neutral-900/60 scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {[
              { id: 'all', label: 'Semua', count: counts.total },
              { id: 'pending', label: 'Menunggu AI', count: counts.pending },
              { id: 'processing', label: 'Diproses AI', count: counts.processing },
              { id: 'completed', label: 'Siap Direview', count: counts.completed },
              { id: 'reviewed', label: 'Direview', count: counts.reviewed },
              { id: 'finalized', label: 'Finalized', count: counts.finalized },
            ].map(tab => {
              const active = selectedStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.06)]'
                      : 'bg-transparent border border-transparent text-slate-500 hover:text-slate-800 dark:text-neutral-500 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-900/40'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold transition-colors ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                      : 'bg-slate-100 dark:bg-neutral-900 text-slate-500 dark:text-neutral-400 group-hover:bg-slate-200 dark:group-hover:bg-neutral-800'
                  }`}>
                    [{tab.count}]
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Bar + Actions Row */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full">
            {/* Search Input */}
            <div className="relative flex-grow w-full">
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-600" />
              <input
                type="text"
                placeholder="Cari nama mahasiswa atau NIM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 dark:focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 dark:focus:ring-cyan-500/10 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600 focus:shadow-[0_0_15px_rgba(6,182,212,0.06)]"
              />
            </div>

            {/* Run AI & Export Actions */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              {/* Run AI Batch Button (Primary action with purple gradient and glow) */}
              <button
                onClick={handleRunAIBatch}
                disabled={batchEligibleCount === 0}
                title={batchEligibleCount === 0 ? "Tidak ada pengumpulan yang siap diproses AI" : undefined}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 hover:scale-[1.02] active:scale-[0.98] text-white px-5 py-3 rounded-xl text-xs font-bold tracking-wider transition-all duration-200 shadow-[0_0_15px_rgba(168,85,247,0.25)] hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none cursor-pointer whitespace-nowrap w-full sm:w-auto"
              >
                <Cpu className="w-4 h-4 animate-pulse" />
                <span className="font-mono">RUN AI BATCH</span>
              </button>

              {/* Combined Export Dropdown */}
              <div className="relative w-full sm:w-auto" ref={dropdownRef}>
                <button
                  onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                  className="w-full flex items-center justify-center gap-2.5 bg-cyan-500/10 border border-cyan-500/35 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 px-4 py-3 rounded-xl text-xs font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Download className="w-4 h-4 text-cyan-500" />
                  <span>Export</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-cyan-600/70 dark:text-cyan-400/70 transition-transform duration-200 ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isExportDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-full sm:w-48 bg-white border border-slate-200 dark:bg-[#0A0A0F]/95 dark:border-neutral-900 rounded-xl shadow-xl z-30 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150 backdrop-blur-md">
                    <button
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        setShowExportModal(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900/60 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        setShowExportModal(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900/60 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-500" />
                      <span>Export Excel</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SUBMISSIONS LIST */}
        {isLoadingData ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-[#0A0A0F]/20 border border-slate-200 dark:border-neutral-950 rounded-2xl gap-3">
            <Loader2 className="w-8 h-8 text-cyan-600 dark:text-cyan-400 animate-spin" />
            <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memuat daftar pengumpulan tugas...</p>
          </div>
        ) : errorMsg ? (
          <div className="bg-red-950/20 border border-red-900/50 text-red-400 p-5 rounded-2xl text-sm flex flex-col gap-2">
            <p className="font-semibold">{errorMsg}</p>
            <button onClick={() => fetchSubmissions()} className="w-fit text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">Coba Lagi</button>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-[#0A0A0F]/30 border border-slate-200 dark:border-neutral-900/50 rounded-2xl">
            <p className="text-slate-500 dark:text-neutral-400 text-sm">Tidak ada pengumpulan tugas mahasiswa yang cocok.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <ResponsiveTableWrapper className="bg-white dark:bg-[#0A0A0F]/80 shadow-xl max-h-[520px]">
                <GlassTable className="min-w-[800px]">
                  <GlassTableHeader className="sticky top-0 z-20">
                    <tr>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Mahasiswa</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Kelas</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-center whitespace-nowrap">Jumlah Jawaban</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-center whitespace-nowrap">Nilai AI</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Status</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Waktu Submit</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-right whitespace-nowrap">Aksi</th>
                    </tr>
                  </GlassTableHeader>
                  <tbody>
                    {filteredSubmissions.map((sub) => {
                      const statusBadge = getStatusBadge(sub.ai_status);
                      const uploadedCount = sub.lembar_jawaban ? sub.lembar_jawaban.length : 0;
                      const mhs = Array.isArray(sub.mahasiswa) ? sub.mahasiswa[0] : sub.mahasiswa;
                      return (
                        <GlassTableRow key={sub.id} onClick={() => router.push(`/dosen/review/${sub.id}`)} hoverable={true}>
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors duration-200">{mhs?.nama_lengkap || 'Unknown'}</div>
                            <div className="text-xs text-slate-500 dark:text-neutral-400 font-mono mt-0.5">{mhs?.nim_nip || '-'}</div>
                          </td>
                          <td className="py-3.5 px-5 text-sm font-semibold text-slate-700 dark:text-neutral-300 whitespace-nowrap">{mhs?.kelas || '-'}</td>
                          <td className="py-3.5 px-5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold">
                              <span className={uploadedCount === 24 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-neutral-400'}>{uploadedCount}</span>
                              <span className="text-slate-300 dark:text-neutral-600">/</span>
                              <span className="text-slate-400 dark:text-neutral-500">24</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold text-purple-600 dark:text-purple-400">
                              {sub.nilai_akhir !== null ? `${sub.nilai_akhir} / 100` : '-'}
                            </div>
                          </td>
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${statusBadge.bg} ${statusBadge.border} ${statusBadge.color}`}>
                              <span>{statusBadge.icon}</span>
                              <span>{statusBadge.text}</span>
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-xs text-slate-500 dark:text-neutral-400 font-medium whitespace-nowrap">{formatDate(sub.waktu_submit)}</td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => router.push(`/dosen/review/${sub.id}`)}
                              className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500 hover:to-blue-600 border border-cyan-500/30 hover:border-transparent text-cyan-600 dark:text-cyan-400 hover:text-white px-4 py-2 rounded-xl text-xs font-extrabold tracking-wider transition-all duration-300 shadow-md cursor-pointer"
                            >
                              <span>REVIEW</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </GlassTableRow>
                      );
                    })}
                  </tbody>
                </GlassTable>
              </ResponsiveTableWrapper>
            </div>

            {/* Mobile Cards Stack */}
            <div className="md:hidden space-y-4">
              {filteredSubmissions.map((sub) => {
                logger.debug("submission", sub.id, sub.ai_status);
                logger.debug("MAHASISWA DATA", sub.mahasiswa);
                logger.debug("LEMBAR DATA", sub.lembar_jawaban);
                const statusBadge = getStatusBadge(sub.ai_status);
                const uploadedCount = sub.lembar_jawaban ? sub.lembar_jawaban.length : 0;
                const mhs = Array.isArray(sub.mahasiswa) ? sub.mahasiswa[0] : sub.mahasiswa;
                return (
                  <div
                    key={sub.id}
                    className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 space-y-4 shadow-lg backdrop-blur-md hover:border-cyan-500/30 transition-all duration-300"
                  >
                    <div className="flex flex-wrap sm:flex-nowrap gap-3 justify-between items-start">
                      <div className="min-w-0 flex-grow">
                        <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight break-words">{mhs?.nama_lengkap || 'Unknown'}</h3>
                        <span className="text-xs text-slate-500 dark:text-neutral-400 font-mono mt-0.5 block">{mhs?.nim_nip || '-'}</span>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusBadge.bg} ${statusBadge.border} ${statusBadge.color} flex-shrink-0 w-fit`}>
                        {statusBadge.icon} {statusBadge.text}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs border-y border-slate-100 dark:border-neutral-900 py-3">
                      <div className="space-y-1">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Kelas</span>
                        <div className="font-semibold text-slate-700 dark:text-neutral-300">{mhs?.kelas || '-'}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Jawaban</span>
                        <div className="font-mono font-bold text-slate-700 dark:text-neutral-300">
                          <span className={uploadedCount === 24 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-neutral-400'}>{uploadedCount}</span> / 24
                        </div>
                      </div>
                      <div className="space-y-1 mt-1">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Nilai AI</span>
                        <div className="font-mono font-bold text-purple-600 dark:text-purple-400">
                          {sub.nilai_akhir !== null ? `${sub.nilai_akhir} / 100` : '-'}
                        </div>
                      </div>
                      <div className="space-y-1 mt-1">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Waktu Submit</span>
                        <div className="text-slate-700 dark:text-neutral-300 font-medium">{formatDate(sub.waktu_submit)}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/dosen/review/${sub.id}`)}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500 hover:to-blue-600 border border-cyan-500/30 hover:border-transparent text-cyan-600 dark:text-cyan-400 hover:text-white py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all duration-300 cursor-pointer"
                    >
                      <span>MULAI REVIEW</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
    </PageTransition>
  );
}
