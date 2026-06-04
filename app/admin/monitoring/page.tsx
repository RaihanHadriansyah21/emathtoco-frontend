'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Loader2, Database, FileImage, Clock, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';

interface PipelineStats {
  submitted: number;
  processing_ai: number;
  reviewed: number;
  finalized: number;
  total: number;
}

interface RecentActivity {
  id: string;
  status_submit: string;
  waktu_submit: string;
  student_name: string;
  course_name: string;
}

export default function MonitoringPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [pipeline, setPipeline] = useState<PipelineStats>({ submitted: 0, processing_ai: 0, reviewed: 0, finalized: 0, total: 0 });
  const [answerSheetCount, setAnswerSheetCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        const { data: profile } = await supabase.from('profil_pengguna').select('role').eq('id', user.id).maybeSingle();
        if (normalizeRole(profile?.role) !== 'admin') { router.push('/'); return; }
        setIsChecking(false);
        fetchMonitoringData();
      } catch { router.push('/'); }
    };
    checkAdmin();
  }, [router]);

  const fetchMonitoringData = async () => {
    setIsLoading(true);
    try {
      const [subsRes, sheetsRes, activityRes] = await Promise.all([
        supabase.from('pengumpulan_tugas').select('status_submit'),
        supabase.from('lembar_jawaban').select('id', { count: 'exact', head: true }),
        supabase.from('pengumpulan_tugas').select(`
          id, status_submit, waktu_submit,
          mahasiswa:profil_pengguna!pengumpulan_tugas_mahasiswa_id_fkey(nama_lengkap),
          mata_kuliah(nama_matkul)
        `).order('waktu_submit', { ascending: false }).limit(15),
      ]);

      const subs = subsRes.data || [];
      setPipeline({
        submitted: subs.filter(s => s.status_submit === 'submitted').length,
        processing_ai: subs.filter(s => s.status_submit === 'processing_ai').length,
        reviewed: subs.filter(s => s.status_submit === 'reviewed').length,
        finalized: subs.filter(s => s.status_submit === 'finalized').length,
        total: subs.length,
      });

      setAnswerSheetCount(sheetsRes.count || 0);

      const activities: RecentActivity[] = (activityRes.data || []).map((a: any) => {
        const mhs = Array.isArray(a.mahasiswa) ? a.mahasiswa[0] : a.mahasiswa;
        const mk = Array.isArray(a.mata_kuliah) ? a.mata_kuliah[0] : a.mata_kuliah;
        return {
          id: a.id,
          status_submit: a.status_submit,
          waktu_submit: a.waktu_submit,
          student_name: mhs?.nama_lengkap || 'Unknown',
          course_name: mk?.nama_matkul || '-',
        };
      });
      setRecentActivity(activities);
    } catch (err) {
      console.error('Error fetching monitoring data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'text-amber-500 dark:text-amber-400';
      case 'processing_ai': return 'text-purple-500 dark:text-purple-400';
      case 'reviewed': return 'text-blue-500 dark:text-blue-400';
      case 'finalized': return 'text-emerald-500 dark:text-emerald-400';
      default: return 'text-slate-500 dark:text-neutral-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'submitted': return 'Menunggu AI';
      case 'processing_ai': return 'Diproses AI';
      case 'reviewed': return 'Direview';
      case 'finalized': return 'Final';
      default: return 'Draft';
    }
  };

  if (isChecking) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>;
  }

  const pipelineStages = [
    { label: 'Menunggu AI', count: pipeline.submitted, color: 'from-amber-500 to-orange-500', bgColor: 'bg-amber-500' },
    { label: 'Diproses AI', count: pipeline.processing_ai, color: 'from-purple-500 to-pink-500', bgColor: 'bg-purple-500' },
    { label: 'Direview', count: pipeline.reviewed, color: 'from-blue-500 to-indigo-500', bgColor: 'bg-blue-500' },
    { label: 'Finalized', count: pipeline.finalized, color: 'from-emerald-500 to-teal-500', bgColor: 'bg-emerald-500' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Activity className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
          Monitoring Sistem
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Statistik pipeline, storage, dan aktivitas sistem EMATHTOCO.</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>
      ) : (
        <>
          {/* Pipeline Stats */}
          <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-sm font-bold text-slate-600 dark:text-neutral-300 uppercase tracking-widest mb-5 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Pipeline Submission
            </h2>
            <div className="space-y-4">
              {pipelineStages.map((stage, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">{stage.label}</span>
                    <span className="text-sm font-mono font-bold text-slate-800 dark:text-white">{stage.count} <span className="text-slate-400 dark:text-neutral-500 font-normal text-xs">/ {pipeline.total}</span></span>
                  </div>
                  <div className="h-3 bg-slate-100 dark:bg-neutral-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${stage.color} rounded-full transition-all duration-700`}
                      style={{ width: pipeline.total > 0 ? `${(stage.count / pipeline.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Storage + Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-cyan-500/10 dark:to-blue-500/5 border border-slate-200 dark:border-cyan-500/15 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Lembar Jawaban</span>
                <FileImage className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-white font-mono">{answerSheetCount}</span>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">total gambar tersimpan</p>
            </div>
            <div className="bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-indigo-500/10 dark:to-purple-500/5 border border-slate-200 dark:border-indigo-500/15 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Total Submission</span>
                <Database className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              </div>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-white font-mono">{pipeline.total}</span>
              <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">pengumpulan tugas</p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-sm font-bold text-slate-600 dark:text-neutral-300 uppercase tracking-widest mb-5 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Aktivitas Terbaru
            </h2>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-neutral-500">Belum ada aktivitas.</p>
              ) : recentActivity.map(a => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-neutral-900/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(a.status_submit).replace('text-', 'bg-').replace(' dark:text-', ' dark:bg-').split(' ')[0]}`} />
                    <div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">{a.student_name}</span>
                      <span className="text-xs text-slate-400 dark:text-neutral-500 ml-2">{a.course_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold ${getStatusColor(a.status_submit)}`}>{getStatusLabel(a.status_submit)}</span>
                    <span className="text-[10px] text-slate-400 dark:text-neutral-600">{formatDate(a.waktu_submit)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
