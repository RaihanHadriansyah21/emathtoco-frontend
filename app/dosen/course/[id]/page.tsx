'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Search, Loader2, ArrowLeft, ArrowRight, BookOpen, Clock, Calendar, CheckSquare, Cpu, Download, FileSpreadsheet, Lock } from 'lucide-react';
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

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

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
 
  // Polling logic when any submission is 'processing'
  useEffect(() => {
    const hasProcessing = submissions.some(s => s.ai_status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchSubmissions();
    }, 2000);

    return () => clearInterval(interval);
  }, [submissions]);

  const fetchSubmissions = async () => {
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

      console.log("RAW SUBMISSION", data);

      setSubmissions((data as unknown as Submission[]) || []);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setErrorMsg('Gagal mengambil data pengumpulan tugas mahasiswa.');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleRunAIBatch = async () => {
    const eligible = submissions.filter(s => (!s.ai_status || s.ai_status === 'pending') && s.ai_status !== 'finalized');
    if (eligible.length === 0) {
      toast.info('Info', 'Tidak ada pengumpulan tugas dengan status Menunggu AI.');
      return;
    }

    setIsRunningAI(true);
    let successCount = 0;
    let failCount = 0;

      for (const sub of eligible) {
        try {
          const res = await apiPost(`/predict/${sub.id}`);
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
      toast.success('Sukses', `Berhasil menjalankan AI untuk ${successCount} tugas.`);
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10 w-full flex-grow">
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
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Portal Penilaian AI</h1>
            <p className="text-slate-500 dark:text-neutral-400 mt-1">
              Mata Kuliah: <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{courseName || 'Memuat...'}</span> {courseCode ? `(${courseCode})` : ''} • Halo Dosen <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{lecturerName}</span>
            </p>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-4 mb-8">
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

        {/* SEARCH AND FILTERS */}
        <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 mb-8 backdrop-blur-md flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center w-full">
            {/* Tab Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto border-b md:border-b-0 border-slate-105 dark:border-neutral-900 pb-2 md:pb-0">
              {[
                { id: 'all', label: 'Semua', count: counts.total },
                { id: 'pending', label: 'Menunggu AI', count: counts.pending },
                { id: 'processing', label: 'Diproses AI', count: counts.processing },
                { id: 'completed', label: 'Siap Direview', count: counts.completed },
                { id: 'reviewed', label: 'Direview Dosen', count: counts.reviewed },
                { id: 'finalized', label: 'Finalized', count: counts.finalized },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    selectedStatus === tab.id
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
                      : 'bg-slate-100 dark:bg-neutral-950/40 border border-slate-200 dark:border-transparent hover:border-slate-300 dark:hover:border-neutral-850 hover:bg-slate-200 dark:hover:bg-neutral-900/30 text-slate-600 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-neutral-200'
                  }`}
                >
                  {tab.label} <span className="ml-1 font-mono text-[10px] opacity-60">({tab.count})</span>
                </button>
              ))}
            </div>

            {/* Search + Batch AI Button Row */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-grow md:w-80">
                <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400 dark:text-neutral-600" />
                <input
                  type="text"
                  placeholder="Cari mahasiswa atau NIM..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-blue-500/60 dark:focus:border-cyan-500/60 focus:ring-1 focus:ring-blue-500/10 dark:focus:ring-cyan-500/10 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
                />
              </div>
              <button
                onClick={handleRunAIBatch}
                disabled={isRunningAI || counts.pending === 0}
                title={counts.pending === 0 ? "Tidak ada submission yang perlu diproses" : undefined}
                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-4 py-3 rounded-xl text-xs font-bold tracking-wider transition-all duration-300 shadow-[0_0_20px_rgba(168,85,247,0.1)] hover:shadow-[0_0_30px_rgba(168,85,247,0.2)] cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunningAI ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Cpu className="w-4 h-4" />
                )}
                <span>{isRunningAI ? 'Processing AI...' : 'Run AI Batch'}</span>
              </button>
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2 bg-emerald-50/50 dark:bg-[#0D1E16] border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-500/10 hover:text-slate-800 dark:hover:text-white px-4 py-3 rounded-xl text-xs font-bold tracking-wider transition-all duration-300 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white px-4 py-3 rounded-xl text-xs font-bold tracking-wider transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] cursor-pointer whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Excel</span>
              </button>
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
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-neutral-900 bg-slate-50 dark:bg-black/40">
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Mahasiswa</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Kelas</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Mata Kuliah</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-center">Jumlah Jawaban</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-center">Nilai AI</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Status</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Waktu Submit</th>
                    <th className="py-4 px-6 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-right">Aksi</th>
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
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors duration-200">{mhs?.nama_lengkap || 'Unknown'}</div>
                          <div className="text-xs text-slate-500 dark:text-neutral-400 font-mono mt-0.5">{mhs?.nim_nip || '-'}</div>
                        </td>
                        <td className="py-4 px-6 text-sm font-semibold text-slate-700 dark:text-neutral-300">{mhs?.kelas || '-'}</td>
                        <td className="py-4 px-6">
                          <div className="text-sm font-semibold text-slate-700 dark:text-neutral-300">{mk?.nama_matkul || 'Unknown'}</div>
                          <div className="text-[10px] text-slate-500 dark:text-neutral-400 font-mono tracking-wider mt-0.5 uppercase">{mk?.kode_matkul || '-'}</div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold">
                            <span className={uploadedCount === 24 ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-500 dark:text-neutral-400'}>{uploadedCount}</span>
                            <span className="text-slate-300 dark:text-neutral-600">/</span>
                            <span className="text-slate-400 dark:text-neutral-500">24</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 text-sm font-mono font-bold text-purple-600 dark:text-purple-400">
                            {sub.nilai_akhir !== null ? sub.nilai_akhir : '-'}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${statusBadge.bg} ${statusBadge.border} ${statusBadge.color}`}>
                            <span>{statusBadge.icon}</span>
                            <span>{statusBadge.text}</span>
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-500 dark:text-neutral-400 font-medium">{formatDate(sub.waktu_submit)}</td>
                        <td className="py-4 px-6 text-right">
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
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base">{mhs?.nama_lengkap || 'Unknown'}</h3>
                        <span className="text-xs text-slate-500 dark:text-neutral-400 font-mono">{mhs?.nim_nip || '-'}</span>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${statusBadge.bg} ${statusBadge.border} ${statusBadge.color}`}>
                        {statusBadge.icon} {statusBadge.text}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs border-y border-slate-100 dark:border-neutral-900 py-3">
                      <div className="space-y-1">
                        <span className="text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-widest text-[9px]">Mata Kuliah</span>
                        <div className="font-semibold text-slate-700 dark:text-neutral-300 truncate max-w-[150px]">{mk?.nama_matkul || 'Unknown'}</div>
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
