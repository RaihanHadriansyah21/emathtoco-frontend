'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Search, Loader2, ArrowLeft, ArrowRight, BookOpen, Clock, Calendar, CheckSquare, Cpu, Download, FileSpreadsheet, Lock, Zap, ChevronDown, CheckCircle, X } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import BatchAIModal from '../../../components/BatchAIModal';
import ExportCSVModal from '../../../components/ExportCSVModal';
import ToastContainer from '../../../components/Toast';
import { useToast } from '@/app/hooks/useToast';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { apiGet, apiPost } from '@/lib/api-client';

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
  status_submit: 'submitted' | 'processing_ai' | 'reviewed' | 'finalized';
  waktu_submit: string;
  nilai_akhir: number | null;
  model_ai: string | null;
  mata_kuliah_id: string | null;
  ai_status: string | null;
  mahasiswa: StudentProfile | null;
  mata_kuliah: Course | null;
  lembar_jawaban: AnswerSheet[] | null;
}

export default function LecturerCoursePortal() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  
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
  const [isRunningAI, setIsRunningAI] = useState(false);
  const { toasts, toast, removeToast } = useToast();

  // Model Selection Modal state (BUG 1 fix)
  const [showModelSelectModal, setShowModelSelectModal] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [selectedBatchModel, setSelectedBatchModel] = useState<string | null>(null);

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

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          await supabase.auth.signOut();
          document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
          router.push('/login');
          return;
        }

        // Fetch user profile and verify role is lecturer
        const { data: profile } = await supabase
          .from('profil_pengguna')
          .select('nama_lengkap, role')
          .eq('id', user.id)
          .maybeSingle();

        const userRole = normalizeRole(profile?.role);
        if (!profile || userRole !== 'dosen') {
          if (profile?.role === 'admin') {
            router.push('/admin');
          } else {
            router.push('/');
          }
          return;
        }

        setLecturerName(profile.nama_lengkap);

        // Authorization check: Verify lecturer is assigned to this course
        const { data: assignmentCheck, error: checkErr } = await supabase
          .from('dosen_mata_kuliah')
          .select('id')
          .eq('dosen_id', user.id)
          .eq('mata_kuliah_id', courseId)
          .maybeSingle();

        if (checkErr || !assignmentCheck) {
          console.warn(`[Access Denied] Lecturer ${user.id} is not assigned to course ${courseId}`);
          setIsAccessDenied(true);
          setIsChecking(false);
          return;
        }

        // Fetch course details
        const { data: courseInfo } = await supabase
          .from('mata_kuliah')
          .select('nama_matkul, kode_matkul')
          .eq('id', courseId)
          .maybeSingle();

        if (courseInfo) {
          setCourseName(courseInfo.nama_matkul);
          setCourseCode(courseInfo.kode_matkul);
        }

        // Fetch student count from backend
        try {
          const statsRes = await apiGet(`/lecturer/course/${courseId}/stats`);
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            setTotalStudents(statsData.total_students);
          }
        } catch (err: any) {
          console.error("AI Backend Error - Gagal memuat statistik mahasiswa:", err);
          const userFriendlyMsg = (err instanceof TypeError || (err.message && err.message.includes("fetch")))
            ? "Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan dan IP backend benar."
            : "Gagal memuat statistik mahasiswa.";
          toast.error("Gagal", userFriendlyMsg);
        }

        setIsChecking(false);

        // Fetch submissions for this course
        fetchSubmissions();
      } catch (err) {
        console.error('Dosen verification error:', err);
        await supabase.auth.signOut();
        document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
        router.push('/login');
      }
    };
    verifyAccess();
  }, [router, courseId]);
 
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

    pollingRef.current = setInterval(() => {
      // Prevent overlapping fetches
      if (isFetchingRef.current) return;
      fetchSubmissions();
    }, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [submissions]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
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
      console.error('Error fetching submissions:', err);
      setErrorMsg('Gagal mengambil data pengumpulan tugas mahasiswa.');
    } finally {
      setIsLoadingData(false);
      isFetchingRef.current = false;
    }
  }, [courseId]);

  // BUG 1 fix: Open model selection modal instead of running directly
  const handleRunAIBatch = async () => {
    const eligible = submissions.filter(s => (!s.ai_status || s.ai_status === 'pending') && s.ai_status !== 'finalized');
    if (eligible.length === 0) {
      toast.info('Info', 'Tidak ada pengumpulan tugas dengan status Menunggu AI.');
      return;
    }

    // Fetch available models from backend
    setIsLoadingModels(true);
    setSelectedBatchModel(null);
    try {
      const res = await apiGet('/ai-models');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.models) {
          setAvailableModels(data.models.map((m: { name: string }) => m.name));
        }
      }
    } catch (err) {
      console.error('Failed to fetch AI models:', err);
      toast.error('Gagal', 'Tidak dapat memuat daftar model AI dari backend.');
      setIsLoadingModels(false);
      return;
    }
    setIsLoadingModels(false);
    setShowModelSelectModal(true);
  };

  // Actually run batch after model is selected
  const executeAIBatch = async () => {
    if (!selectedBatchModel) return;
    setShowModelSelectModal(false);

    const eligible = submissions.filter(s => (!s.ai_status || s.ai_status === 'pending') && s.ai_status !== 'finalized');
    if (eligible.length === 0) return;

    setIsRunningAI(true);
    let successCount = 0;
    let failCount = 0;

    for (const sub of eligible) {
      try {
        const res = await apiPost(`/predict/${sub.id}?model=${selectedBatchModel}`);
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err: any) {
        console.error("AI Backend Error:", err);
        const userFriendlyMsg = (err instanceof TypeError || (err.message && err.message.includes("fetch")))
          ? "Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan dan IP backend benar."
          : `Gagal memprediksi tugas ${sub.id}.`;
        toast.error("AI Backend Error", userFriendlyMsg);
        failCount++;
      }
    }

    setIsRunningAI(false);
    if (failCount > 0) {
      toast.warning('Selesai dengan error', `${successCount} sukses, ${failCount} gagal.`);
    } else {
      toast.success('Sukses', `Berhasil menjalankan AI (${selectedBatchModel}) untuk ${successCount} tugas.`);
    }
    fetchSubmissions();
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
    <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans pb-16 relative overflow-hidden flex flex-col">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* BUG 1 fix: Model Selection Modal */}
      {showModelSelectModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-neutral-800 rounded-2xl max-w-md w-full shadow-[0_0_60px_rgba(168,85,247,0.06)] overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-neutral-900">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <Cpu className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Pilih Model AI</h2>
                  <p className="text-[11px] text-slate-500 dark:text-neutral-500 font-mono tracking-wider mt-0.5">
                    {submissions.filter(s => (!s.ai_status || s.ai_status === 'pending') && s.ai_status !== 'finalized').length} tugas akan diproses
                  </p>
                </div>
              </div>
              <button onClick={() => setShowModelSelectModal(false)} className="text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-white transition-colors p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {isLoadingModels ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                  <span className="text-sm text-slate-500 dark:text-neutral-400">Memuat model...</span>
                </div>
              ) : (
                <>
                  <label className="block text-[10px] font-mono font-bold tracking-widest text-slate-400 dark:text-neutral-500 uppercase mb-2">
                    Model AI yang Tersedia
                  </label>
                  <div className="space-y-2">
                    {availableModels.map(model => (
                      <button
                        key={model}
                        onClick={() => setSelectedBatchModel(model)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                          selectedBatchModel === model
                            ? 'bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-300'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700'
                        }`}
                      >
                        <Zap className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        <span className="font-semibold text-sm">{model}</span>
                        {selectedBatchModel === model && (
                          <CheckCircle className="w-4 h-4 ml-auto text-purple-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <button
                onClick={executeAIBatch}
                disabled={!selectedBatchModel || isLoadingModels}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-mono text-sm font-bold tracking-wider transition-all duration-300 cursor-pointer bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:shadow-[0_0_40px_rgba(168,85,247,0.25)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Cpu className="w-4 h-4" />
                <span>Mulai Batch Processing</span>
              </button>
              {!selectedBatchModel && !isLoadingModels && (
                <p className="text-xs text-amber-500 dark:text-amber-400 text-center">Pilih model AI terlebih dahulu untuk memulai batch.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch AI Modal */}
      <BatchAIModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        submissions={submissions.map(s => {
          const mhs = Array.isArray(s.mahasiswa) ? s.mahasiswa[0] : s.mahasiswa;
          return {
            id: s.id,
            status_submit: s.status_submit,
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

      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/8 rounded-full blur-[120px] animate-float-blue"></div>
        <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/8 rounded-full blur-[130px] animate-float-purple"></div>
      </div>

      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10 w-full flex-grow">
        {/* Back navigation and Welcome message */}
        <div className="mb-8 flex items-start gap-4">
          <button
            onClick={() => router.push('/dosen')}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-[#0A0A0F]/80 dark:border-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-950 dark:hover:text-white transition-all cursor-pointer shadow-sm flex items-center justify-center flex-shrink-0"
            title="Kembali ke Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Portal Penilaian AI</h1>
            <p className="text-slate-500 dark:text-neutral-400 mt-1">
              Mata Kuliah: <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{courseName || 'Memuat...'}</span> {courseCode ? `(${courseCode})` : ''} • Halo Dosen <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{lecturerName}</span>
            </p>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
          {[
            { label: 'Total Pengumpulan', val: counts.total, icon: '📊', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-cyan-500/10 dark:to-blue-500/5', border: 'border-slate-200 dark:border-cyan-500/10 dark:hover:border-cyan-500/20' },
            { label: 'Mahasiswa Terdaftar', val: totalStudents !== null ? totalStudents : '-', icon: '👥', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-teal-500/10 dark:to-emerald-500/5', border: 'border-slate-200 dark:border-teal-500/10 dark:hover:border-teal-500/20' },
            { label: 'Menunggu AI', val: counts.pending, icon: '⏳', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-amber-500/10 dark:to-orange-500/5', border: 'border-slate-200 dark:border-amber-500/10 dark:hover:border-amber-500/20' },
            { label: 'Diproses AI', val: counts.processing, icon: '🤖', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-purple-500/10 dark:to-indigo-500/5', border: 'border-slate-200 dark:border-purple-500/10 dark:hover:border-purple-500/20' },
            { label: 'Siap Direview', val: counts.completed, icon: '👨‍🏫', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-blue-500/10 dark:to-indigo-500/5', border: 'border-slate-200 dark:border-blue-500/10 dark:hover:border-blue-500/20' },
            { label: 'Direview Dosen', val: counts.reviewed, icon: '👨‍🏫', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-indigo-500/10 dark:to-blue-500/5', border: 'border-slate-200 dark:border-indigo-500/10 dark:hover:border-indigo-500/20' },
            { label: 'Finalized', val: counts.finalized, icon: '🏁', color: 'bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-emerald-500/10 dark:to-teal-500/5', border: 'border-slate-200 dark:border-emerald-500/10 dark:hover:border-emerald-500/20' }
          ].map((card, idx) => (
            <div
              key={idx}
              className={`${card.color} border ${card.border} backdrop-blur-md rounded-2xl p-4 shadow-lg flex flex-col justify-between transition-all duration-300 ${idx === 6 ? 'col-span-1 min-[360px]:col-span-2 lg:col-span-1' : ''}`}
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
        <div className="relative z-20 bg-white/90 dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 sm:p-5 mb-8 backdrop-blur-md flex flex-col gap-4 shadow-lg">
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
                      : 'bg-slate-100 dark:bg-neutral-900 text-slate-500 dark:text-neutral-550 group-hover:bg-slate-200 dark:group-hover:bg-neutral-800'
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
                disabled={isRunningAI || counts.pending === 0}
                title={counts.pending === 0 ? "Tidak ada submission yang perlu diproses" : undefined}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 hover:scale-[1.02] active:scale-[0.98] text-white px-5 py-3 rounded-xl text-xs font-bold tracking-wider transition-all duration-200 shadow-[0_0_15px_rgba(168,85,247,0.25)] hover:shadow-[0_0_25px_rgba(168,85,247,0.4)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none cursor-pointer whitespace-nowrap w-full sm:w-auto"
              >
                {isRunningAI ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Cpu className="w-4 h-4 animate-pulse" />
                )}
                <span className="font-mono">{isRunningAI ? 'PROCESSING...' : 'RUN AI BATCH'}</span>
              </button>

              {/* Combined Export Dropdown */}
              <div className="relative w-full sm:w-auto" ref={dropdownRef}>
                <button
                  onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                  className="w-full flex items-center justify-center gap-2.5 bg-slate-50 border border-slate-200 dark:bg-neutral-950 dark:border-neutral-900 hover:border-cyan-500/40 hover:bg-slate-100 dark:hover:bg-neutral-900/60 text-slate-700 dark:text-neutral-350 px-4 py-3 rounded-xl text-xs font-bold tracking-wider transition-all duration-200 cursor-pointer shadow-sm hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Download className="w-4 h-4 text-cyan-500" />
                  <span>Export</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-neutral-550 transition-transform duration-200 ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
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
            <div className="hidden md:block bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl overflow-hidden shadow-xl dark:shadow-2xl backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[950px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-neutral-900 bg-slate-50 dark:bg-black/40">
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Mahasiswa</th>
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Kelas</th>
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Mata Kuliah</th>
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-center whitespace-nowrap">Jumlah Jawaban</th>
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-center whitespace-nowrap">Nilai AI</th>
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Status</th>
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Waktu Submit</th>
                      <th className="py-4 px-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-right whitespace-nowrap">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-900/50">
                    {filteredSubmissions.map((sub) => {
                      console.log("submission", sub.id, sub.ai_status);
                      console.log("MAHASISWA DATA", sub.mahasiswa);
                      console.log("LEMBAR DATA", sub.lembar_jawaban);
                      const statusBadge = getStatusBadge(sub.ai_status);
                      const uploadedCount = sub.lembar_jawaban ? sub.lembar_jawaban.length : 0;
                      const mhs = Array.isArray(sub.mahasiswa) ? sub.mahasiswa[0] : sub.mahasiswa;
                      const mk = Array.isArray(sub.mata_kuliah) ? sub.mata_kuliah[0] : sub.mata_kuliah;
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-white/1 transition-colors duration-200 group">
                          <td className="py-4 px-6 whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors duration-200">{mhs?.nama_lengkap || 'Unknown'}</div>
                            <div className="text-xs text-slate-500 dark:text-neutral-400 font-mono mt-0.5">{mhs?.nim_nip || '-'}</div>
                          </td>
                          <td className="py-4 px-6 text-sm font-semibold text-slate-700 dark:text-neutral-300 whitespace-nowrap">{mhs?.kelas || '-'}</td>
                          <td className="py-4 px-6 whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-700 dark:text-neutral-300">{mk?.nama_matkul || 'Unknown'}</div>
                            <div className="text-[10px] text-slate-500 dark:text-neutral-400 font-mono tracking-wider mt-0.5 uppercase">{mk?.kode_matkul || '-'}</div>
                          </td>
                          <td className="py-4 px-6 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold">
                              <span className={uploadedCount === 24 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-neutral-400'}>{uploadedCount}</span>
                              <span className="text-slate-300 dark:text-neutral-600">/</span>
                              <span className="text-slate-400 dark:text-neutral-500">24</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold text-purple-600 dark:text-purple-400">
                              {sub.nilai_akhir !== null ? sub.nilai_akhir : '-'}
                            </div>
                          </td>
                          <td className="py-4 px-6 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${statusBadge.bg} ${statusBadge.border} ${statusBadge.color}`}>
                              <span>{statusBadge.icon}</span>
                              <span>{statusBadge.text}</span>
                            </span>
                          </td>
                          <td className="py-4 px-6 text-xs text-slate-500 dark:text-neutral-400 font-medium whitespace-nowrap">{formatDate(sub.waktu_submit)}</td>
                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <button
                              onClick={() => router.push(`/dosen/review/${sub.id}`)}
                              className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500 hover:to-blue-600 border border-cyan-500/30 hover:border-transparent text-cyan-600 dark:text-cyan-400 hover:text-white px-4 py-2 rounded-xl text-xs font-extrabold tracking-wider transition-all duration-300 shadow-md cursor-pointer"
                            >
                              <span>REVIEW</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards Stack */}
            <div className="md:hidden space-y-4">
              {filteredSubmissions.map((sub) => {
                console.log("submission", sub.id, sub.ai_status);
                console.log("MAHASISWA DATA", sub.mahasiswa);
                console.log("LEMBAR DATA", sub.lembar_jawaban);
                const statusBadge = getStatusBadge(sub.ai_status);
                const uploadedCount = sub.lembar_jawaban ? sub.lembar_jawaban.length : 0;
                const mhs = Array.isArray(sub.mahasiswa) ? sub.mahasiswa[0] : sub.mahasiswa;
                const mk = Array.isArray(sub.mata_kuliah) ? sub.mata_kuliah[0] : sub.mata_kuliah;
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
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Mata Kuliah</span>
                        <div className="font-semibold text-slate-700 dark:text-neutral-300 break-words">{mk?.nama_matkul || 'Unknown'}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Kelas</span>
                        <div className="font-semibold text-slate-700 dark:text-neutral-300">{mhs?.kelas || '-'}</div>
                      </div>
                      <div className="space-y-1 mt-2">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Jawaban</span>
                        <div className="font-mono font-bold text-slate-700 dark:text-neutral-300">
                          <span className={uploadedCount === 24 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-neutral-400'}>{uploadedCount}</span> / 24
                        </div>
                      </div>
                      <div className="space-y-1 mt-2">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Nilai AI</span>
                        <div className="font-mono font-bold text-purple-600 dark:text-purple-400">
                          {sub.nilai_akhir !== null ? sub.nilai_akhir : '-'}
                        </div>
                      </div>
                      <div className="space-y-1 mt-2 col-span-2">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Waktu Submit</span>
                        <div className="text-slate-500 dark:text-neutral-400 font-medium">{formatDate(sub.waktu_submit)}</div>
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
  );
}
