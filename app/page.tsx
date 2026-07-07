'use client';

import { logger } from '@/lib/logger';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, QrCode, Loader2, CheckCircle, AlertTriangle, Camera, X } from 'lucide-react';
import Navbar from './components/Navbar';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import PageTransition from '@/components/ui/PageTransition';
import { GlassCard } from '@/components/ui/card';
import { sha256Hex } from '@/lib/join-token';

import { useAuth } from './components/AuthGate';
import BackendStatusBanner from './components/BackendStatusBanner';

interface MataKuliah {
  id: string;
  nama_matkul: string;
  nama_dosen: string;
  icon_name: string;
  kode_matkul?: string;
  created_at?: string;
}

const iconMap: Record<string, string> = {
  security: "🔒",
  compress: "🗜️",
  ai: "🤖",
  network: "📡",
  math: "📘",
};

const getCourseIcon = (iconName: string): string => {
  return iconMap[iconName] || "📚";
};

export default function StudentDashboard() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [courses, setCourses] = useState<MataKuliah[]>([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [reuploadWarnings, setReuploadWarnings] = useState<Record<string, { count: number; firstSlot: string }>>({});

  // Join Kelas state
  const [tokenInput, setTokenInput] = useState('');
  const [joinStatus, setJoinStatus] = useState<'idle' | 'joining' | 'success' | 'error'>('idle');
  const [joinMessage, setJoinMessage] = useState('');
  const [joinedCourseId, setJoinedCourseId] = useState<string | null>(null);

  // Device & Camera state
  const [isMobile, setIsMobile] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<any>(null);

  // Deteksi device mobile/handphone responsif
  useEffect(() => {
    const checkMobile = () => {
      const hasTouch = window.matchMedia('(pointer: coarse)').matches;
      const isNarrow = window.innerWidth < 768;
      setIsMobile(hasTouch || isNarrow);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fungsi pemrosesan join kelas reusable
  const executeJoinClass = async (rawInput: string) => {
    if (!rawInput.trim() || joinStatus === 'joining') return;
    setJoinStatus('joining');
    setJoinMessage('Menghubungkan ke kelas...');
    try {
      let token = rawInput.trim();
      try {
        const url = new URL(token);
        const urlToken = url.searchParams.get('token');
        if (urlToken) token = urlToken;
      } catch {
        // Bukan URL - gunakan raw token langsung
      }

      const tokenHash = await sha256Hex(token);
      const { data, error } = await supabase.rpc('join_class_with_token', {
        p_token_hash: tokenHash,
      });
      if (error) throw error;

      const result = data as { success: boolean; course_id?: string };
      setJoinedCourseId(result.course_id ?? null);
      setJoinStatus('success');
      setJoinMessage('Berhasil masuk ke kelas!');
      setTokenInput('');

      // Reload courses after 1.5s
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      logger.error('Failed to join class:', err);
      setJoinStatus('error');
      setJoinMessage('QR tidak valid, sudah kadaluarsa, atau limit scan habis.');
    }
  };

  const startScanner = async () => {
    setJoinStatus('idle');
    setJoinMessage('');
    setShowScanner(true);
    
    // Inisialisasi scanner secara dinamis setelah div dirender
    setTimeout(() => {
      const { Html5Qrcode } = require('html5-qrcode');
      const html5QrCode = new Html5Qrcode('qr-reader');
      scannerRef.current = html5QrCode;

      html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 }
        },
        async (decodedText: string) => {
          // Callback sukses
          setTokenInput(decodedText);
          stopScanner();
          await executeJoinClass(decodedText);
        },
        () => {
          // Callback silent fail untuk scanning frame
        }
      ).catch((err: any) => {
        logger.error('Failed to start QR scanner:', err);
      });
    }, 300);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        scannerRef.current = null;
        setShowScanner(false);
      }).catch((err: any) => {
        logger.error('Failed to stop QR scanner:', err);
        setShowScanner(false);
      });
    } else {
      setShowScanner(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      router.replace('/login');
      return;
    }

    const role = normalizeRole(user.role);
    if (role === 'admin') {
      router.replace('/admin');
      return;
    }
    if (role === 'dosen') {
      router.replace('/dosen');
      return;
    }
    if (role !== 'mahasiswa') {
      setIsLoadingCourses(false);
      return;
    }

    // Ambil data user yang sedang login aktif dari session Supabase
    const getDashboardData = async () => {
      logger.debug("[HOME] auth check start");
      try {
        logger.debug(`[DASHBOARD_FETCH] fetchEnrollment start: ${Date.now()}`);
        const enrollmentStart = Date.now();
        // Fetch enrolled course IDs from mahasiswa_mata_kuliah
        const { data: enrollmentData, error: enrollmentError } = await supabase
          .from('mahasiswa_mata_kuliah')
          .select('mata_kuliah_id')
          .eq('mahasiswa_id', user.id);
        const enrollmentDuration = Date.now() - enrollmentStart;
        logger.debug(`[DASHBOARD_FETCH] fetchEnrollment end: ${Date.now()} | duration: ${enrollmentDuration}ms`);

        if (enrollmentError) {
          throw enrollmentError;
        }

        const enrolledCourseIds = (enrollmentData || []).map(e => e.mata_kuliah_id);

        if (enrolledCourseIds.length === 0) {
          setCourses([]);
          setIsLoadingCourses(false);
          return;
        }

        logger.debug(`[DASHBOARD_FETCH] fetchCourses start: ${Date.now()}`);
        const coursesStart = Date.now();
        // Fetch courses matching the enrolled IDs
        const { data: coursesData, error: coursesError } = await supabase
          .from('mata_kuliah')
          .select('*')
          .in('id', enrolledCourseIds);
        const coursesDuration = Date.now() - coursesStart;
        logger.debug(`[DASHBOARD_FETCH] fetchCourses end: ${Date.now()} | duration: ${coursesDuration}ms`);

        if (coursesError) {
          throw coursesError;
        }

        setCourses(coursesData || []);

        logger.debug(`[DASHBOARD_FETCH] fetchWarnings start: ${Date.now()}`);
        const warningsStart = Date.now();
        // Check for reupload warnings (lembar_jawaban with status = 'reupload_required')
        const { data: submissions, error: subsError } = await supabase
          .from('pengumpulan_tugas')
          .select('id, mata_kuliah_id')
          .eq('mahasiswa_id', user.id);

        if (subsError) {
           throw subsError;
        }

        if (submissions && submissions.length > 0) {
           const subIds = submissions.map(s => s.id);
           
           const { data: sheets, error: sheetsError } = await supabase
             .from('lembar_jawaban')
             .select('pengumpulan_tugas_id, status, section_code')
             .in('pengumpulan_tugas_id', subIds)
             .eq('status', 'reupload_required');

           if (sheetsError) {
             throw sheetsError;
           }

           const warningCounts: Record<string, { count: number; firstSlot: string }> = {};
           
           sheets?.forEach(sheet => {
              const sub = submissions.find(s => s.id === sheet.pengumpulan_tugas_id);
              if (sub) {
                const courseId = sub.mata_kuliah_id;
                const slot = sheet.section_code ? sheet.section_code.replace('S-', '').toLowerCase() : '1a';
                if (!warningCounts[courseId]) {
                  warningCounts[courseId] = { count: 0, firstSlot: slot };
                }
                warningCounts[courseId].count += 1;
              }
           });

           setReuploadWarnings(warningCounts);
        }
        const warningsDuration = Date.now() - warningsStart;
        logger.debug(`[DASHBOARD_FETCH] fetchWarnings end: ${Date.now()} | duration: ${warningsDuration}ms`);
      } catch (err) {
        logger.error('Gagal mengambil data beranda:', err);
        setCourseError('Terjadi kesalahan memuat daftar mata kuliah.');
      } finally {
        setIsLoadingCourses(false);
      }
    };
    getDashboardData();
  }, [user, loading]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans relative overflow-hidden">
      {/* Elegant Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/10 rounded-full blur-[120px] animate-float-blue"></div>
        <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-[130px] animate-float-purple"></div>
      </div>

      {/* HEADER NAVBAR */}
      <Navbar />
      <BackendStatusBanner />

      {/* BODY UTAMA */}
      <PageTransition>
        <main className="max-w-3xl mx-auto px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-12 relative z-10">
          <div className="mb-10">
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Selamat Datang Kembali!</h1>
            <p className="text-slate-500 dark:text-neutral-400 mt-2">Silakan pilih mata kuliah di bawah ini untuk memulai pengumpulan lembar jawaban tugas.</p>
          </div>

          {/* JOIN KELAS SECTION */}
          <div className="mb-8">
            <div className="bg-white/95 dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <QrCode className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-widest text-slate-800 dark:text-white uppercase">Join Kelas</h2>
                  <p className="text-xs text-slate-500 dark:text-neutral-500">Tempelkan link QR atau token dari dosen</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 flex gap-2 min-w-0">
                  <input
                    type="text"
                    placeholder="Tempelkan link QR atau token di sini..."
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value);
                      if (joinStatus !== 'idle') {
                        setJoinStatus('idle');
                        setJoinMessage('');
                      }
                    }}
                    disabled={joinStatus === 'joining'}
                    className="flex-1 bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/10 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600 disabled:opacity-50 min-w-0"
                  />
                  {isMobile && (
                    <button
                      type="button"
                      onClick={startScanner}
                      disabled={joinStatus === 'joining'}
                      className="flex-shrink-0 flex items-center justify-center bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 p-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Scan QR via Kamera"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => executeJoinClass(tokenInput)}
                  disabled={!tokenInput.trim() || joinStatus === 'joining'}
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {joinStatus === 'joining' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <QrCode className="w-4 h-4" />
                  )}
                  <span>{joinStatus === 'joining' ? 'BERGABUNG...' : 'JOIN'}</span>
                </button>
              </div>

              {joinMessage && (
                <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl ${
                  joinStatus === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : joinStatus === 'error'
                      ? 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'
                      : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400'
                }`}>
                  {joinStatus === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
                  {joinStatus === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
                  {joinStatus === 'joining' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {joinMessage}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-bold tracking-widest text-slate-500 dark:text-neutral-400 uppercase mb-2">Mata Kuliah Terdaftar</h2>

            {isLoadingCourses ? (
              <div className="grid gap-4">
                {[1, 2].map((idx) => (
                  <div key={idx} className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-850"></div>
                      <div className="space-y-2">
                        <div className="h-3 w-16 bg-slate-100 dark:bg-neutral-900 rounded"></div>
                        <div className="h-5 w-48 bg-slate-100 dark:bg-neutral-900 rounded"></div>
                        <div className="h-4 w-32 bg-slate-100 dark:bg-neutral-900 rounded"></div>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-neutral-900"></div>
                  </div>
                ))}
              </div>
            ) : courseError ? (
              <div className="bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-sm">
                <p className="font-medium">{courseError}</p>
              </div>
            ) : courses.length === 0 ? (
              <div className="text-center py-14 bg-white dark:bg-[#0A0A0F]/40 border border-slate-200 dark:border-neutral-900/50 rounded-2xl space-y-2">
                <p className="text-lg font-bold text-slate-700 dark:text-neutral-300">Belum ada mata kuliah yang terdaftar</p>
                <p className="text-slate-500 dark:text-neutral-400 text-sm max-w-md mx-auto">Silakan hubungi administrator atau dosen untuk mendapatkan akses ke mata kuliah.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {courses.map((matkul) => {
                  const warning = reuploadWarnings[matkul.id];
                  const hasWarning = !!warning;

                  return (
                    <GlassCard
                      key={matkul.id}
                      onClick={() => {
                        if (hasWarning) {
                          router.push(`/matkul/${matkul.id}#slot-${warning.firstSlot}`);
                        } else {
                          router.push(`/matkul/${matkul.id}`);
                        }
                      }}
                      accentColor={hasWarning ? 'from-amber-400 to-orange-500' : undefined}
                      className={`group flex items-center justify-between gap-3 sm:gap-4 min-w-0 w-full ${
                        hasWarning
                          ? 'border-amber-500/40 hover:border-amber-400 bg-amber-500/5 dark:bg-amber-950/5'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl border flex items-center justify-center text-xl sm:text-2xl transition-colors duration-300 flex-shrink-0 ${
                          hasWarning
                            ? 'bg-amber-500/5 border-amber-500/30 group-hover:bg-amber-500/10 group-hover:border-amber-500/60'
                            : 'bg-slate-50 border-slate-200 group-hover:bg-blue-500/10 dark:bg-black dark:border-neutral-800 dark:group-hover:bg-cyan-500/10 dark:group-hover:border-cyan-500/60'
                        }`}>
                          {getCourseIcon(matkul.icon_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {matkul.kode_matkul && (
                              <span className={`text-xs font-mono ${hasWarning ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-cyan-400'}`}>{matkul.kode_matkul}</span>
                            )}
                            {hasWarning && (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-md animate-pulse">
                                ⚠ ACTION REQUIRED
                              </span>
                            )}
                          </div>
                          <h3 className={`text-base sm:text-lg font-bold text-slate-800 dark:text-white mt-0.5 transition-colors duration-200 truncate ${hasWarning ? 'group-hover:text-amber-600 dark:group-hover:text-amber-300' : 'group-hover:text-blue-500 dark:group-hover:text-cyan-300'}`}>{matkul.nama_matkul}</h3>
                          <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                            <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-400 truncate">Dosen: <span className="text-slate-800 dark:text-neutral-200">{matkul.nama_dosen}</span></p>
                            {hasWarning && (
                              <span className="text-xs font-bold text-amber-600 dark:text-amber-400/90">
                                • {warning.count} bagian perlu upload ulang
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                        hasWarning
                          ? 'bg-slate-100 border-amber-500/30 text-amber-500 dark:bg-neutral-950 dark:border-amber-500/30 dark:text-neutral-500 group-hover:bg-gradient-to-r group-hover:from-amber-500 group-hover:to-orange-600 group-hover:border-transparent group-hover:text-white'
                          : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-400 group-hover:bg-gradient-to-r group-hover:from-blue-500 group-hover:to-indigo-600 dark:group-hover:from-cyan-500 dark:group-hover:to-indigo-600 group-hover:border-transparent group-hover:text-white'
                      }`}>
                        <ChevronRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </PageTransition>

      {/* MODAL SCANNER QR CAMERA */}
      {showScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md px-4">
          <div className="bg-white/95 dark:bg-[#07070C]/90 border border-slate-200 dark:border-neutral-900 w-full max-w-sm rounded-3xl p-6 relative overflow-hidden shadow-2xl">
            <button
              onClick={stopScanner}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-2 mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
                <Camera className="w-5 h-5 text-cyan-500" />
                Scan QR Kelas
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-500">Arahkan kamera ke QR code join kelas</p>
            </div>

            <div className="w-full aspect-square bg-black border border-neutral-900 rounded-2xl overflow-hidden flex items-center justify-center relative shadow-inner">
              <div id="qr-reader" className="w-full h-full object-cover"></div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={stopScanner}
                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-neutral-300 font-bold py-3 px-5 rounded-xl text-xs uppercase tracking-widest transition-all cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
