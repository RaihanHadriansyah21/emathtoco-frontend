'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Loader2, AlertTriangle, Trash2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createAuditLog } from '@/lib/services/audit-service';
import { normalizeRole } from '@/lib/utils';
import { API_URL } from '@/lib/config';
import { apiPost } from '@/lib/api-client';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';

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



  const handleReset = async () => {
    if (confirmText !== 'RESET') return;
    setIsResetting(true);

    // Audit counters
    let storageFilesDeleted = 0;
    let predictionsDeleted = 0;
    let answerSheetsDeleted = 0;
    let submissionsDeleted = 0;
    let enrollmentsDeleted = 0;

    let currentStep = '';

    try {
      if (resetType === 'submissions' || resetType === 'all') {
        // ==========================================
        // STEP 1: Ambil seluruh submission target reset
        // ==========================================
        currentStep = 'STEP 1 (Fetch Submissions)';
        console.log('[RESET] Step 1: Fetching submissions...');
        const { data: submissions, error: fetchSubsError } = await supabase
          .from('pengumpulan_tugas')
          .select('id');

        if (fetchSubsError) {
          throw new Error(fetchSubsError.message);
        }

        const subIds = submissions?.map(s => s.id) || [];
        console.log(`[RESET] Submissions found: ${subIds.length}`);

        // ==========================================
        // STEP 2: Ambil seluruh lembar_jawaban yang terkait
        // ==========================================
        currentStep = 'STEP 2 (Fetch Answer Sheets)';
        console.log('[RESET] Step 2: Fetching related lembar_jawaban...');
        let sheets: { id: string; image_url: string | null }[] = [];
        if (subIds.length > 0) {
          const { data: fetchSheets, error: fetchSheetsError } = await supabase
            .from('lembar_jawaban')
            .select('id, image_url')
            .in('pengumpulan_tugas_id', subIds);

          if (fetchSheetsError) {
            throw new Error(fetchSheetsError.message);
          }
          sheets = fetchSheets || [];
        }
        const answerSheetIds = sheets.map(s => s.id);
        console.log(`[RESET] Answer sheets found: ${answerSheetIds.length}`);

        // ==========================================
        // STEP 3: Ambil seluruh hasil_prediksi yang terkait
        // ==========================================
        currentStep = 'STEP 3 (Fetch Predictions)';
        console.log('[RESET] Step 3: Fetching related hasil_prediksi...');
        let initialPredCount = 0;
        if (answerSheetIds.length > 0) {
          const countRes = await apiPost('/admin/predictions/count', { lembar_jawaban_ids: answerSheetIds });
          if (!countRes.ok) {
            const errText = await countRes.text();
            throw new Error(`Gagal menghitung hasil_prediksi: ${errText}`);
          }
          const countData = await countRes.json();
          initialPredCount = countData.count;
        }
        console.log(`[RESET] Predictions found: ${initialPredCount}`);

        // ==========================================
        // STEP 4: Delete file storage. WAIT UNTIL COMPLETE.
        // ==========================================
        currentStep = 'STEP 4 (Delete Storage Files)';
        const paths = sheets
          .map((s) => s.image_url)
          .filter((url): url is string => typeof url === 'string' && url.length > 0);

        if (paths.length > 0) {
          console.log(`[RESET] Step 4: Deleting ${paths.length} files from bucket "lembar-jawaban"...`);
          const { data: deleteData, error: deleteStorageError } = await supabase.storage
            .from('lembar-jawaban')
            .remove(paths);

          if (deleteStorageError) {
            console.error('[RESET] Storage deletion failed:', deleteStorageError);
            throw new Error(deleteStorageError.message);
          }

          storageFilesDeleted = deleteData?.length ?? paths.length;
          console.log(`[RESET] ✓ Storage files deleted: ${storageFilesDeleted}`);
        } else {
          console.log('[RESET] Storage already clean (0 files)');
        }

        // ==========================================
        // STEP 5: Delete seluruh hasil_prediksi. WAIT UNTIL COMPLETE.
        // ==========================================
        currentStep = 'STEP 5 (Delete Predictions)';
        console.log("[RESET] Answer sheet IDs:", answerSheetIds);
        console.log(`[RESET] answerSheetIds length: ${answerSheetIds.length}`);

        if (answerSheetIds.length > 0) {
          console.log('[RESET] Step 5: Deleting all related hasil_prediksi...');
          const deleteRes = await apiPost('/admin/predictions/delete', { lembar_jawaban_ids: answerSheetIds });
          if (!deleteRes.ok) {
            const errText = await deleteRes.text();
            throw new Error(`Gagal menghapus hasil_prediksi: ${errText}`);
          }
          const deleteData = await deleteRes.json();
          predictionsDeleted = deleteData.deleted;

          // Verifikasi: SELECT COUNT(*) harus 0 untuk prediksi yang terkait.
          const verifyRes = await apiPost('/admin/predictions/count', { lembar_jawaban_ids: answerSheetIds });
          if (!verifyRes.ok) {
            const errText = await verifyRes.text();
            throw new Error(`Gagal memverifikasi sisa hasil_prediksi: ${errText}`);
          }
          const verifyData = await verifyRes.json();
          const remaining = verifyData.count;

          // Wajib log sesuai format permintaan
          console.log(`[RESET] Predictions found: ${initialPredCount}`);
          console.log(`[RESET] Predictions deleted: ${predictionsDeleted}`);
          console.log(`[RESET] Predictions remaining: ${remaining}`);

          if (remaining > 0) {
            throw new Error(`Reset aborted. ${remaining} predictions still reference answer sheets.`);
          }
        } else {
          console.log(`[RESET] Predictions found: 0`);
          console.log(`[RESET] Predictions deleted: 0`);
          console.log(`[RESET] Predictions remaining: 0`);
        }

        // ==========================================
        // STEP 6: Delete seluruh lembar_jawaban. WAIT UNTIL COMPLETE.
        // ==========================================
        currentStep = 'STEP 6 (Delete Answer Sheets)';
        if (answerSheetIds.length > 0) {
          console.log('[RESET] Step 6: Deleting related lembar_jawaban...');
          const { data: deletedLembar, error: deleteLembarError } = await supabase
            .from('lembar_jawaban')
            .delete()
            .in('id', answerSheetIds)
            .select('id');

          if (deleteLembarError) {
            throw new Error(deleteLembarError.message);
          }

          answerSheetsDeleted = deletedLembar?.length ?? 0;
          console.log(`[RESET] Answer sheets found: ${answerSheetIds.length}`);
          console.log(`[RESET] Answer sheets deleted: ${answerSheetsDeleted}`);

          // Verifikasi: SELECT COUNT(*) harus 0 untuk lembar_jawaban yang terkait.
          const { count: remainingSheetsCount, error: countSheetsError } = await supabase
            .from('lembar_jawaban')
            .select('*', { count: 'exact', head: true })
            .in('id', answerSheetIds);

          if (countSheetsError) {
            throw new Error(`Gagal memverifikasi sisa lembar_jawaban: ${countSheetsError.message}`);
          }

          const remainingSheets = remainingSheetsCount ?? 0;
          console.log(`[RESET] Remaining answer sheets: ${remainingSheets}`);

          if (remainingSheets > 0) {
            throw new Error(`Masih tersisa ${remainingSheets} record lembar_jawaban.`);
          }
        } else {
          console.log('[RESET] Step 6: No related lembar_jawaban found to delete.');
          console.log('[RESET] Answer sheets found: 0');
          console.log('[RESET] Answer sheets deleted: 0');
        }

        // ==========================================
        // STEP 7: Delete seluruh pengumpulan_tugas. WAIT UNTIL COMPLETE.
        // ==========================================
        currentStep = 'STEP 7 (Delete Submissions)';
        if (subIds.length > 0) {
          console.log('[RESET] Step 7: Deleting related pengumpulan_tugas...');
          const { data: deletedSubs, error: deleteSubsError } = await supabase
            .from('pengumpulan_tugas')
            .delete()
            .in('id', subIds)
            .select('id');

          if (deleteSubsError) {
            throw new Error(deleteSubsError.message);
          }

          submissionsDeleted = deletedSubs?.length ?? 0;
          console.log(`[RESET] Submissions deleted: ${submissionsDeleted}`);
        } else {
          console.log('[RESET] Step 7: No related pengumpulan_tugas found to delete.');
          console.log('[RESET] Submissions deleted: 0');
        }
      }

      // ==========================================
      // STEP 8: Delete mahasiswa_mata_kuliah (jika reset enrollment atau full reset).
      // ==========================================
      if (resetType === 'enrollments' || resetType === 'all') {
        currentStep = 'STEP 8 (Delete Enrollments)';
        console.log('[RESET] Step 8: Deleting mahasiswa_mata_kuliah...');
        const { data: deletedEnrollments, error: deleteEnrollmentsError } = await supabase
          .from('mahasiswa_mata_kuliah')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
          .select('id');

        if (deleteEnrollmentsError) {
          throw new Error(deleteEnrollmentsError.message);
        }

        enrollmentsDeleted = deletedEnrollments?.length ?? 0;
        console.log(`[RESET] Enrollments deleted: ${enrollmentsDeleted}`);
      }

      // Build audit summary
      const auditLines: string[] = ['Reset selesai!', ''];
      if (resetType === 'submissions' || resetType === 'all') {
        auditLines.push(`Storage files deleted: ${storageFilesDeleted}`);
        auditLines.push(`Predictions deleted: ${predictionsDeleted}`);
        auditLines.push(`Answer sheets deleted: ${answerSheetsDeleted}`);
        auditLines.push(`Submissions deleted: ${submissionsDeleted}`);
      }
      if (resetType === 'enrollments' || resetType === 'all') {
        auditLines.push(`Enrollments deleted: ${enrollmentsDeleted}`);
      }

      console.log('[RESET] === AUDIT SUMMARY ===');
      auditLines.forEach(line => console.log(`[RESET] ${line}`));

      // Log SYSTEM_RESET
      await createAuditLog({
        action: 'SYSTEM_RESET',
        target: 'system',
        detail: {
          storage_deleted: storageFilesDeleted,
          predictions_deleted: predictionsDeleted,
          answer_sheets_deleted: answerSheetsDeleted,
          submissions_deleted: submissionsDeleted,
          enrollments_deleted: enrollmentsDeleted
        }
      });

      setResultMessage({ type: 'success', text: auditLines.join('\n') });
      setShowConfirmModal(false);
    } catch (err: any) {
      console.error('[RESET] Reset process failed:', err);
      setResultMessage({ type: 'error', text: `Reset berhenti pada ${currentStep}` });
    } finally {
      setIsResetting(false);
    }
  };

  if (isChecking) {
    return <PageLoader message="Memverifikasi admin..." />;
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
    <PageTransition>
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
        <div className={`rounded-2xl p-4 text-sm font-medium whitespace-pre-wrap ${
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
      {showConfirmModal && (() => {
        const isExactMatch = confirmText === 'RESET';
        const hasInput = confirmText.length > 0;
        const isCaseError = hasInput && !isExactMatch && confirmText.toUpperCase() === 'RESET';
        const isWrongText = hasInput && !isExactMatch && !isCaseError;

        const borderClass = isExactMatch
          ? 'border-emerald-500 dark:border-emerald-500 ring-1 ring-emerald-500/20'
          : (isCaseError || isWrongText)
            ? 'border-red-500 dark:border-red-500 ring-1 ring-red-500/20'
            : 'border-slate-200 dark:border-neutral-800 focus:border-red-500/60';

        return (
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
                autoComplete="off"
                spellCheck={false}
                className={`w-full bg-slate-50 dark:bg-black ${borderClass} rounded-xl py-3 px-4 text-sm text-center font-mono font-bold text-slate-800 dark:text-white focus:outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600 tracking-widest`}
              />

              {/* Real-time validation feedback */}
              <div className="mt-2.5 min-h-[2.5rem]">
                {isExactMatch ? (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-center flex items-center justify-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Input valid. Tombol reset aktif.
                  </p>
                ) : isCaseError ? (
                  <div className="text-center space-y-1">
                    <p className="text-[11px] text-slate-500 dark:text-neutral-500 font-mono">
                      Input saat ini: <span className="text-red-500 dark:text-red-400 font-bold">{confirmText}</span>
                    </p>
                    <p className="text-xs font-semibold text-red-500 dark:text-red-400">
                      RESET harus menggunakan huruf kapital penuh.
                    </p>
                  </div>
                ) : isWrongText ? (
                  <div className="text-center space-y-1">
                    <p className="text-[11px] text-slate-500 dark:text-neutral-500 font-mono">
                      Input saat ini: <span className="text-red-500 dark:text-red-400 font-bold">{confirmText}</span>
                    </p>
                    <p className="text-xs font-semibold text-red-500 dark:text-red-400">
                      Ketik tepat: RESET
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-neutral-500 text-center">
                    Masukkan <span className="font-mono font-bold">RESET</span> dengan huruf kapital penuh untuk mengaktifkan tombol reset.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 mt-4">
                <button onClick={() => setShowConfirmModal(false)} disabled={isResetting} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 cursor-pointer transition-all">Batal</button>
                <button
                  onClick={handleReset}
                  disabled={confirmText !== 'RESET' || isResetting}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer transition-all duration-300 ${
                    isExactMatch && !isResetting
                      ? 'bg-red-600 hover:bg-red-500 shadow-[0_0_20px_rgba(239,68,68,0.15)] opacity-100'
                      : 'bg-red-600/50 opacity-30 cursor-not-allowed'
                  }`}
                >
                  {isResetting ? 'Menghapus...' : 'Konfirmasi Reset'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </PageTransition>
  );
}
