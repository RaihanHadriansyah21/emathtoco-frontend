'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, Loader2, Users, BookOpen, FileText, CheckCircle2,
  Clock, ArrowRight, TrendingUp, Activity,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';
import { GlassTable, GlassTableHeader, GlassTableRow, ResponsiveTableWrapper } from '@/components/ui/table';
import { GlassCard } from '@/components/ui/card';

import { useRequireRole } from '@/app/hooks/useRequireRole';
import BackendStatusBanner from '@/app/components/BackendStatusBanner';

interface RecentSubmission {
  id: string;
  status_submit: string;
  waktu_submit: string;
  mahasiswa: { nama_lengkap: string; nim_nip: string } | null;
  mata_kuliah: { nama_matkul: string } | null;
}

export default function AdminDashboard() {
  const { isLoading, isAuthorized, userName } = useRequireRole('admin');
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [adminName, setAdminName] = useState('');

  // Stats
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalCourses, setTotalCourses] = useState(0);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [finalizedCount, setFinalizedCount] = useState(0);
  const [pendingAI, setPendingAI] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    if (!isLoading && isAuthorized) {
      setAdminName(userName || "Administrator EMATHTOCO");
      setIsChecking(false);
      fetchDashboardData();
    }
  }, [isLoading, isAuthorized, userName]);

  const fetchDashboardData = async () => {
    setIsLoadingData(true);
    try {
      // Fetch all counts in parallel
      const [usersRes, coursesRes, subsRes] = await Promise.all([
        supabase.from('profil_pengguna').select('id', { count: 'exact', head: true }),
        supabase.from('mata_kuliah').select('id', { count: 'exact', head: true }),
        supabase.from('pengumpulan_tugas').select('id, status_submit'),
      ]);

      setTotalUsers(usersRes.count || 0);
      setTotalCourses(coursesRes.count || 0);

      const subs = subsRes.data || [];
      setTotalSubmissions(subs.length);
      setFinalizedCount(subs.filter(s => s.status_submit === 'finalized').length);
      setPendingAI(subs.filter(s => s.status_submit === 'submitted').length);
      setReviewedCount(subs.filter(s => s.status_submit === 'reviewed').length);

      // Recent submissions
      const { data: recent } = await supabase
        .from('pengumpulan_tugas')
        .select(`
          id,
          status_submit,
          waktu_submit,
          mahasiswa:profil_pengguna!pengumpulan_tugas_mahasiswa_id_fkey(nama_lengkap, nim_nip),
          mata_kuliah(nama_matkul)
        `)
        .order('waktu_submit', { ascending: false })
        .limit(8);

      setRecentSubmissions((recent as unknown as RecentSubmission[]) || []);
    } catch (err) {
      console.error('Admin dashboard data fetch error:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted': return { icon: '⏳', text: 'Menunggu AI', color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
      case 'processing_ai': return { icon: '🤖', text: 'Diproses AI', color: 'text-purple-500 dark:text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
      case 'reviewed': return { icon: '👨‍🏫', text: 'Direview', color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
      case 'finalized': return { icon: '🏁', text: 'Final', color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
      default: return { icon: '📝', text: 'Draft', color: 'text-neutral-500 dark:text-neutral-400', bg: 'bg-neutral-500/10', border: 'border-neutral-500/20' };
    }
  };

  if (isChecking) {
    return <PageLoader message="Memverifikasi admin..." />;
  }

  const statCards = [
    { label: 'Total Pengguna', val: totalUsers, icon: Users, accentColor: 'from-cyan-400 to-blue-500', iconColor: 'text-cyan-500 dark:text-cyan-400' },
    { label: 'Total Mata Kuliah', val: totalCourses, icon: BookOpen, accentColor: 'from-indigo-400 to-purple-500', iconColor: 'text-indigo-500 dark:text-indigo-400' },
    { label: 'Total Pengumpulan', val: totalSubmissions, icon: FileText, accentColor: 'from-amber-400 to-orange-500', iconColor: 'text-amber-500 dark:text-amber-400' },
    { label: 'Menunggu AI', val: pendingAI, icon: Clock, accentColor: 'from-purple-400 to-pink-500', iconColor: 'text-purple-500 dark:text-purple-400' },
    { label: 'Direview', val: reviewedCount, icon: Activity, accentColor: 'from-blue-400 to-indigo-500', iconColor: 'text-blue-500 dark:text-blue-400' },
    { label: 'Finalized', val: finalizedCount, icon: CheckCircle2, accentColor: 'from-emerald-400 to-teal-500', iconColor: 'text-emerald-500 dark:text-emerald-400' },
  ];

  const quickActions = [
    { label: 'Kelola Pengguna', href: '/admin/users', icon: Users, desc: 'CRUD user dan role' },
    { label: 'Kelola Mata Kuliah', href: '/admin/courses', icon: BookOpen, desc: 'Tambah, edit, hapus matkul' },
    { label: 'Monitoring Sistem', href: '/admin/monitoring', icon: Activity, desc: 'Pipeline & statistik' },
    { label: 'Audit Log', href: '/admin/audit', icon: FileText, desc: 'Riwayat aktivitas admin' },
  ];

  return (
    <PageTransition>
      <BackendStatusBanner />
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto w-full space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/25 rounded-2xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Admin Dashboard</h1>
              <p className="text-slate-500 dark:text-neutral-400 text-sm">
                Selamat datang, <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{adminName}</span>. Kelola sistem E-MATHTOCO dari sini.
              </p>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        {isLoadingData ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {statCards.map((card, idx) => {
                const Icon = card.icon;
                return (
                  <GlassCard
                    key={idx}
                    hoverScale={false}
                    accentColor={card.accentColor}
                    className="p-5 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest leading-none">{card.label}</span>
                      <Icon className={`w-4 h-4 ${card.iconColor}`} />
                    </div>
                    <span className="text-3xl font-extrabold text-slate-800 dark:text-white font-mono">{card.val}</span>
                  </GlassCard>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="text-sm font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Aksi Cepat
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <GlassCard
                      key={action.href}
                      onClick={() => router.push(action.href)}
                      className="group p-5 text-left flex flex-col justify-between"
                    >
                      <div>
                        <Icon className="w-5 h-5 text-cyan-500 dark:text-cyan-400 mb-3" />
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">{action.label}</h3>
                        <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1">{action.desc}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-300 dark:text-neutral-700 mt-3 group-hover:text-cyan-500 dark:group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
                    </GlassCard>
                  );
                })}
              </div>
            </div>

            {/* Recent Submissions */}
            <div>
              <h2 className="text-sm font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Pengumpulan Terbaru
              </h2>
              {recentSubmissions.length === 0 ? (
                <div className="bg-white dark:glass-card border border-slate-200 dark:border-neutral-900 rounded-2xl p-8 text-center text-slate-400 dark:text-neutral-500 text-sm">
                  Belum ada pengumpulan tugas.
                </div>
              ) : (
                <ResponsiveTableWrapper className="bg-white dark:glass-card shadow-xl">
                  <GlassTable className="min-w-[650px]">
                    <GlassTableHeader>
                      <tr>
                        <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-400 whitespace-nowrap">Mahasiswa</th>
                        <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-400 whitespace-nowrap">Mata Kuliah</th>
                        <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-400 whitespace-nowrap">Status</th>
                        <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-400 whitespace-nowrap">Waktu</th>
                      </tr>
                    </GlassTableHeader>
                    <tbody>
                      {recentSubmissions.map((sub) => {
                        const badge = getStatusBadge(sub.status_submit);
                        const mhs = Array.isArray(sub.mahasiswa) ? sub.mahasiswa[0] : sub.mahasiswa;
                        const mk = Array.isArray(sub.mata_kuliah) ? sub.mata_kuliah[0] : sub.mata_kuliah;
                        return (
                          <GlassTableRow key={sub.id} hoverable={true}>
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <div className="text-sm font-semibold text-slate-800 dark:text-white">{mhs?.nama_lengkap || 'Unknown'}</div>
                              <div className="text-[10px] text-slate-400 dark:text-neutral-500 font-mono mt-0.5">{mhs?.nim_nip || '-'}</div>
                            </td>
                            <td className="py-3.5 px-5 text-sm text-slate-650 dark:text-neutral-350 whitespace-nowrap">{mk?.nama_matkul || '-'}</td>
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${badge.bg} ${badge.border} ${badge.color}`}>
                                {badge.icon} {badge.text}
                              </span>
                            </td>
                            <td className="py-3.5 px-5 text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap font-medium">{formatDate(sub.waktu_submit)}</td>
                          </GlassTableRow>
                        );
                      })}
                    </tbody>
                  </GlassTable>
                </ResponsiveTableWrapper>
              )}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
