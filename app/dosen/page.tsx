'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ChevronRight, BookOpen } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';

interface Course {
  id: string;
  nama_matkul: string;
  kode_matkul: string;
  nama_dosen: string;
  icon_name: string;
}

interface SubmissionStat {
  mata_kuliah_id: string;
  status_submit: string;
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

export default function LecturerDashboard() {
  const router = useRouter();
  
  // Auth state
  const [isChecking, setIsChecking] = useState(true);
  const [lecturerName, setLecturerName] = useState('');

  // Data state
  const [courses, setCourses] = useState<Course[]>([]);
  const [submissionsStats, setSubmissionsStats] = useState<SubmissionStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const verifyUserAndFetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          await supabase.auth.signOut();
          document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
          window.location.href = '/login';
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
          if (userRole === 'admin') {
            router.push('/admin');
          } else {
            router.push('/');
          }
          return;
        }

        setLecturerName(profile.nama_lengkap);

        // Fetch assigned course IDs
        const { data: assignments, error: assignErr } = await supabase
          .from('dosen_mata_kuliah')
          .select('mata_kuliah_id')
          .eq('dosen_id', user.id);

        if (assignErr) throw assignErr;

        const courseIds = (assignments || []).map(a => a.mata_kuliah_id);

        if (courseIds.length === 0) {
          setCourses([]);
          setSubmissionsStats([]);
          setIsLoading(false);
          setIsChecking(false);
          return;
        }

        // Fetch courses details
        const { data: coursesData, error: coursesError } = await supabase
          .from('mata_kuliah')
          .select('*')
          .in('id', courseIds);

        if (coursesError) throw coursesError;
        setCourses(coursesData || []);

        // Fetch only id and status_submit of submissions to compute counters in memory
        const { data: subsData, error: subsError } = await supabase
          .from('pengumpulan_tugas')
          .select('mata_kuliah_id, status_submit')
          .in('mata_kuliah_id', courseIds)
          .in('status_submit', ['submitted', 'processing_ai', 'reviewed', 'finalized']);

        if (subsError) throw subsError;
        setSubmissionsStats(subsData || []);

        setIsLoading(false);
        setIsChecking(false);
      } catch (err) {
        console.error('Error loading lecturer dashboard data:', err);
        setErrorMsg('Gagal mengambil data kelas dan pengumpulan tugas.');
        setIsLoading(false);
        setIsChecking(false);
      }
    };
    verifyUserAndFetchData();
  }, [router]);

  // Helper to count submissions for a specific course
  const getCourseStats = (courseId: string) => {
    const courseSubs = submissionsStats.filter(s => s.mata_kuliah_id === courseId);
    return {
      total: courseSubs.length,
      submitted: courseSubs.filter(s => s.status_submit === 'submitted').length,
      processing: courseSubs.filter(s => s.status_submit === 'processing_ai').length,
      reviewed: courseSubs.filter(s => s.status_submit === 'reviewed').length,
      finalized: courseSubs.filter(s => s.status_submit === 'finalized').length,
    };
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
          <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memverifikasi profil Dosen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans relative overflow-hidden flex flex-col">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/12 rounded-full blur-[120px] animate-float-blue"></div>
        <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/12 rounded-full blur-[130px] animate-float-purple"></div>
      </div>

      <Navbar />

      <main className="max-w-4xl mx-auto px-4 py-12 relative z-10 w-full flex-grow">
        {/* Welcome message */}
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Selamat Datang, Dosen!</h1>
          <p className="text-slate-500 dark:text-neutral-400 mt-2">Halo <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{lecturerName}</span>. Silakan pilih mata kuliah di bawah ini untuk mengelola penilaian AI tugas mahasiswa.</p>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-bold tracking-widest text-slate-500 dark:text-neutral-400 uppercase mb-2">Mata Kuliah Saya</h2>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((idx) => (
                <div key={idx} className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-5 flex flex-col justify-between animate-pulse h-44">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-850"></div>
                    <div className="space-y-2">
                      <div className="h-3 w-16 bg-slate-100 dark:bg-neutral-900 rounded"></div>
                      <div className="h-5 w-40 bg-slate-100 dark:bg-neutral-900 rounded"></div>
                    </div>
                  </div>
                  <div className="h-8 bg-slate-100 dark:bg-neutral-900 rounded-xl mt-4"></div>
                </div>
              ))}
            </div>
          ) : errorMsg ? (
            <div className="bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-sm">
              <p className="font-medium">{errorMsg}</p>
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#0A0A0F]/40 border border-slate-200 dark:border-neutral-900/50 rounded-2xl space-y-3">
              <p className="text-lg font-bold text-slate-700 dark:text-neutral-300">Belum Ada Mata Kuliah Ditugaskan</p>
              <p className="text-slate-500 dark:text-neutral-400 text-sm max-w-md mx-auto">Administrator belum menugaskan Anda ke mata kuliah mana pun. Silakan hubungi administrator.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {courses.map((course) => {
                const stats = getCourseStats(course.id);
                return (
                  <div
                    key={course.id}
                    onClick={() => router.push(`/dosen/course/${course.id}`)}
                    className="group border border-slate-200 dark:border-neutral-900 bg-white dark:bg-[#0A0A0F]/80 rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all duration-300 hover:border-blue-500/40 dark:hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.05)] dark:hover:shadow-[0_0_30px_rgba(6,182,212,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-xl border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-black flex items-center justify-center text-2xl group-hover:bg-blue-500/10 dark:group-hover:bg-cyan-500/10 group-hover:border-blue-500/40 dark:group-hover:border-cyan-500/60 transition-colors duration-300 flex-shrink-0">
                          {getCourseIcon(course.icon_name)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-mono text-blue-600 dark:text-cyan-400 font-bold">{course.kode_matkul}</span>
                          <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white mt-0.5 group-hover:text-blue-500 dark:group-hover:text-cyan-300 transition-colors duration-200 break-words">{course.nama_matkul}</h3>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-neutral-800 bg-slate-100 dark:bg-neutral-950 text-slate-400 dark:text-neutral-400 flex items-center justify-center group-hover:bg-gradient-to-r group-hover:from-blue-500 group-hover:to-indigo-600 dark:group-hover:from-cyan-500 dark:group-hover:to-indigo-600 group-hover:border-transparent group-hover:text-white transition-all duration-300 flex-shrink-0">
                        <ChevronRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>

                    {/* Breakdown Stats inside Course Card */}
                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-neutral-900 grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
                      <div className="bg-slate-50 dark:bg-black/30 rounded-xl py-2 px-0.5 border border-slate-100 dark:border-neutral-950">
                        <div className="text-[9px] min-[360px]:text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Total</div>
                        <div className="text-base sm:text-lg font-extrabold text-slate-700 dark:text-neutral-200 mt-0.5 font-mono">{stats.total}</div>
                      </div>
                      <div className="bg-amber-500/5 rounded-xl py-2 px-0.5 border border-amber-500/10">
                        <div className="text-[9px] min-[360px]:text-[10px] font-bold text-amber-500/80 dark:text-amber-500/60 uppercase tracking-wider">Wait AI</div>
                        <div className="text-base sm:text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 font-mono">{stats.submitted}</div>
                      </div>
                      <div className="bg-blue-500/5 rounded-xl py-2 px-0.5 border border-blue-500/10">
                        <div className="text-[9px] min-[360px]:text-[10px] font-bold text-blue-500/80 dark:text-blue-500/60 uppercase tracking-wider">Review</div>
                        <div className="text-base sm:text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-0.5 font-mono">{stats.reviewed}</div>
                      </div>
                      <div className="bg-emerald-500/5 rounded-xl py-2 px-0.5 border border-emerald-500/10">
                        <div className="text-[9px] min-[360px]:text-[10px] font-bold text-emerald-500/80 dark:text-emerald-500/60 uppercase tracking-wider">Final</div>
                        <div className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">{stats.finalized}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
