'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';

import { apiPost } from '@/lib/api-client';
import PageTransition from '@/components/ui/PageTransition';

type ResetType = 'submissions' | 'enrollments' | 'all';

interface ResetResult {
  submissions_deleted?: number;
  answer_sheets_deleted?: number;
  predictions_deleted?: number;
  enrollments_deleted?: number;
  cleanup_job_id?: string | null;
}

interface ResetErrorResponse {
  detail?: string;
  error?: {
    code?: string;
  };
}

function getResetErrorMessage(status: number, body: ResetErrorResponse): string {
  if (status === 403) {
    return 'Reset ditolak karena akun ini tidak memiliki akses admin.';
  }
  if (status === 401) {
    return 'Sesi admin sudah berakhir. Silakan masuk kembali.';
  }
  if (body.detail === 'DEMO_RESET_FAILED' || body.error?.code === 'INTERNAL_ERROR') {
    return 'Database menolak operasi reset. Tidak ada data yang diubah.';
  }
  return 'Reset ditolak oleh server. Tidak ada data yang diubah.';
}

const resetOptions = [
  {
    type: 'submissions' as const,
    title: 'Hapus Semua Pengumpulan Tugas',
    desc: 'Menghapus pengumpulan, jawaban, dan prediksi. Profil pengguna tetap aman.',
    icon: Trash2,
    color: 'border-amber-500/30 hover:border-amber-500/50',
    iconColor: 'text-amber-500 dark:text-amber-400',
  },
  {
    type: 'enrollments' as const,
    title: 'Hapus Semua Enrollment Mahasiswa',
    desc: 'Menghapus enrollment. Profil pengguna dan mata kuliah tetap ada.',
    icon: RotateCcw,
    color: 'border-orange-500/30 hover:border-orange-500/50',
    iconColor: 'text-orange-500 dark:text-orange-400',
  },
  {
    type: 'all' as const,
    title: 'Reset Penuh (Demo Reset)',
    desc: 'Menghapus seluruh submission dan enrollment untuk mengulang demo.',
    icon: ShieldAlert,
    color: 'border-red-500/30 hover:border-red-500/50',
    iconColor: 'text-red-500 dark:text-red-400',
  },
];

export default function DemoResetPage() {
  const [selectedType, setSelectedType] = useState<ResetType | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleReset = async () => {
    if (!selectedType || confirmText !== 'RESET' || isResetting) return;
    setIsResetting(true);
    setMessage(null);
    try {
      const response = await apiPost('/admin/reset', {
        reset_type: selectedType,
      }, {
        timeoutMs: 60_000,
      });
      if (!response.ok) {
        let errorBody: ResetErrorResponse = {};
        try {
          errorBody = await response.json() as ResetErrorResponse;
        } catch {
          // The status code still provides a safe fallback message.
        }
        throw new Error(getResetErrorMessage(response.status, errorBody));
      }
      const result = await response.json() as ResetResult;
      const lines = [
        'Reset selesai.',
        `Submission: ${result.submissions_deleted ?? 0}`,
        `Lembar jawaban: ${result.answer_sheets_deleted ?? 0}`,
        `Prediksi: ${result.predictions_deleted ?? 0}`,
        `Enrollment: ${result.enrollments_deleted ?? 0}`,
      ];
      if (result.cleanup_job_id) {
        lines.push('Pembersihan file Storage telah masuk antrean.');
      }
      setMessage({ type: 'success', text: lines.join('\n') });
      setSelectedType(null);
      setConfirmText('');
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error
          ? error.message
          : 'Reset gagal. Tidak ada data yang diubah.',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <RotateCcw className="w-6 h-6 text-red-500 dark:text-red-400" />
            Demo Reset
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">
            Reset data sistem untuk keperluan demo atau pengujian.
          </p>
        </div>

        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-200">
            Operasi ini permanen. Database dihapus secara transaksional dan file
            Storage dibersihkan melalui antrean yang dapat diulang.
          </p>
        </div>

        <div className="grid gap-4">
          {resetOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => {
                  setSelectedType(option.type);
                  setConfirmText('');
                  setMessage(null);
                }}
                className={`text-left rounded-2xl border bg-white/70 dark:bg-white/[0.03] p-5 transition-colors ${option.color}`}
              >
                <div className="flex items-start gap-4">
                  <Icon className={`w-6 h-6 ${option.iconColor}`} />
                  <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">
                      {option.title}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">
                      {option.desc}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {message && (
          <pre className={`whitespace-pre-wrap rounded-xl p-4 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-500/10 text-red-700 dark:text-red-300'
          }`}>
            {message.text}
          </pre>
        )}

        {selectedType && (
          <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-500/25 bg-white dark:bg-[#0b0d16] p-6 shadow-2xl">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Konfirmasi reset
              </h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2">
                Ketik <strong>RESET</strong> untuk melanjutkan.
              </p>
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                className="mt-4 w-full rounded-xl border border-slate-300 dark:border-white/15 bg-transparent px-4 py-3"
                autoFocus
              />
              {message?.type === 'error' && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
                >
                  {message.text}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  disabled={isResetting}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-white/15"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={confirmText !== 'RESET' || isResetting}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white disabled:opacity-40 flex items-center gap-2"
                >
                  {isResetting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
