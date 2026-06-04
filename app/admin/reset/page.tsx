'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Loader2, AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';

export default function DemoResetPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  // Reset states
  const [confirmText, setConfirmText] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetType, setResetType] = useState<'submissions' | 'enrollments' | 'all' | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        const { data: profile } = await supabase.from('profil_pengguna').select('role').eq('id', user.id).maybeSingle();
        if (normalizeRole(profile?.role) !== 'admin') { router.push('/'); return; }
        setIsChecking(false);
      } catch { router.push('/'); }
    };
    checkAdmin();
  }, [router]);

  const openConfirm = (type: 'submissions' | 'enrollments' | 'all') => {
    setResetType(type);
    setConfirmText('');
    setShowConfirmModal(true);
    setResultMessage(null);
  };

  const deleteSubmissionFiles = async (): Promise<void> => {
    console.log('[RESET] Fetching all image_urls from lembar_jawaban...');
    const { data: sheets, error: fetchError } = await supabase
      .from('lembar_jawaban')
      .select('image_url');

    if (fetchError) {
      console.error('[RESET] Failed to fetch image_urls from lembar_jawaban:', fetchError);
      throw new Error(`Gagal membaca path storage: ${fetchError.message}`);
    }

    const paths = (sheets || [])
      .map((s) => s.image_url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);

    console.log('[RESET] Compiled paths list for deletion:', paths);

    if (paths.length > 0) {
      console.log(`[RESET] Deleting ${paths.length} files from bucket "lembar-jawaban"...`);
      const { data: deleteData, error: deleteStorageError } = await supabase.storage
        .from('lembar-jawaban')
        .remove(paths);

      if (deleteStorageError) {
        console.error('[RESET] Error during storage files deletion:', deleteStorageError);
        throw deleteStorageError;
      }
      
      console.log('[RESET] Successfully deleted storage files. Response:', deleteData);
    } else {
      console.log('[RESET] Storage is already clean (0 files found to delete).');
    }
  };

  const handleReset = async () => {
    if (confirmText !== 'RESET') return;
    setIsResetting(true);
    try {
      if (resetType === 'submissions' || resetType === 'all') {
        // STEP 1-4: Delete storage files before deleting DB rows
        await deleteSubmissionFiles();

        // STEP 5: Only after storage cleanup succeeds:
        // Delete child tables first, then parent tables
        console.log('[RESET] Deleting hasil_prediksi rows...');
        const { error: deleteHasilError } = await supabase
          .from('hasil_prediksi')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (deleteHasilError) {
          console.warn('[RESET] Warning deleting hasil_prediksi:', deleteHasilError);
        }

        console.log('[RESET] Deleting lembar_jawaban rows...');
        const { error: deleteLembarError } = await supabase
          .from('lembar_jawaban')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (deleteLembarError) throw deleteLembarError;

        console.log('[RESET] Deleting pengumpulan_tugas rows...');
        const { error: deleteSubmissionsError } = await supabase
          .from('pengumpulan_tugas')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (deleteSubmissionsError) throw deleteSubmissionsError;
      }

      if (resetType === 'enrollments' || resetType === 'all') {
        console.log('[RESET] Deleting mahasiswa_mata_kuliah rows...');
        const { error: deleteEnrollmentsError } = await supabase
          .from('mahasiswa_mata_kuliah')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        if (deleteEnrollmentsError) throw deleteEnrollmentsError;
      }

      setResultMessage({ type: 'success', text: `Reset berhasil! Data ${resetType === 'submissions' ? 'pengumpulan tugas' : resetType === 'enrollments' ? 'enrollment mahasiswa' : 'submissions + enrollment'} telah dihapus.` });
      setShowConfirmModal(false);
    } catch (err: any) {
      console.error('[RESET] Reset process failed:', err);
      setResultMessage({ type: 'error', text: `Gagal melakukan reset: ${err.message}` });
    } finally {
      setIsResetting(false);
    }
  };

  if (isChecking) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>;
  }

  const resetOptions = [
    {
      type: 'submissions' as const,
      title: 'Hapus Semua Pengumpulan Tugas',
      desc: 'Menghapus seluruh data pengumpulan_tugas dan lembar_jawaban. Profil pengguna tetap aman.',
      icon: Trash2,
      color: 'border-amber-500/30 hover:border-amber-500/50',
      iconColor: 'text-amber-500 dark:text-amber-400',
      bgIcon: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      type: 'enrollments' as const,
      title: 'Hapus Semua Enrollment Mahasiswa',
      desc: 'Menghapus seluruh data mahasiswa_mata_kuliah. Profil pengguna dan mata kuliah tetap ada.',
      icon: RotateCcw,
      color: 'border-orange-500/30 hover:border-orange-500/50',
      iconColor: 'text-orange-500 dark:text-orange-400',
      bgIcon: 'bg-orange-500/10 border-orange-500/20',
    },
    {
      type: 'all' as const,
      title: 'Reset Penuh (Demo Reset)',
      desc: 'Menghapus semua submissions + enrollments. Hanya menyisakan user dan mata kuliah.',
      icon: ShieldAlert,
      color: 'border-red-500/30 hover:border-red-500/50',
      iconColor: 'text-red-500 dark:text-red-400',
      bgIcon: 'bg-red-500/10 border-red-500/20',
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <RotateCcw className="w-6 h-6 text-red-500 dark:text-red-400" />
          Demo Reset
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Reset data sistem untuk keperluan demo atau testing.</p>
      </div>

      {/* Warning Banner */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-1">Zona Berbahaya</h3>
          <p className="text-xs text-slate-600 dark:text-neutral-400 leading-relaxed">
            Aksi pada halaman ini bersifat <strong className="text-red-500">permanen dan tidak dapat dibatalkan</strong>.
            Data yang dihapus tidak bisa dipulihkan. Pastikan Anda memahami konsekuensi sebelum melanjutkan.
          </p>
        </div>
      </div>

      {/* Result Message */}
      {resultMessage && (
        <div className={`rounded-2xl p-4 text-sm font-medium ${
          resultMessage.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400'
        }`}>
          {resultMessage.text}
        </div>
      )}

      {/* Reset Options */}
      <div className="space-y-4">
        {resetOptions.map(opt => {
          const Icon = opt.icon;
          return (
            <div key={opt.type} className={`bg-white dark:bg-[#0A0A0F]/80 border ${opt.color} rounded-2xl p-5 backdrop-blur-md shadow-lg transition-all flex items-center justify-between gap-4`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-2xl ${opt.bgIcon} border flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">{opt.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </div>
              <button
                onClick={() => openConfirm(opt.type)}
                className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-all cursor-pointer shadow-[0_0_20px_rgba(239,68,68,0.1)]"
              >
                Reset
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#0D0D14] border border-red-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white text-center mb-2">Konfirmasi Reset</h3>
            <p className="text-sm text-slate-500 dark:text-neutral-400 text-center mb-5">
              Ketik <code className="bg-red-500/10 text-red-500 dark:text-red-400 px-1.5 py-0.5 rounded font-mono font-bold">RESET</code> untuk mengkonfirmasi penghapusan data.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Ketik RESET di sini..."
              className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-3 px-4 text-sm text-center font-mono font-bold text-slate-800 dark:text-white focus:outline-none focus:border-red-500/60 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600 uppercase tracking-widest"
            />
            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => setShowConfirmModal(false)} disabled={isResetting} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 cursor-pointer transition-all">Batal</button>
              <button
                onClick={handleReset}
                disabled={confirmText !== 'RESET' || isResetting}
                className="px-4 py-2.5 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-500 text-white cursor-pointer disabled:opacity-30 transition-all shadow-[0_0_20px_rgba(239,68,68,0.15)]"
              >
                {isResetting ? 'Menghapus...' : 'Konfirmasi Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
