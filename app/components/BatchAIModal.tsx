'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Cpu, Play, CheckCircle, AlertTriangle,
  Loader2, ChevronDown, Filter, Zap, BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeIn, modalTransition } from '@/styles/motion';
import type {
  BatchAIProgress,
} from '@/lib/types/batch-ai';
import { ALL_SECTION_CODES } from '@/lib/types/batch-ai';
import { AI_MODELS, type AIModel } from '@/lib/constants/ai-models';
import { apiGet, apiPost } from '@/lib/api-client';

// ============================================================
// Types for the modal
// ============================================================

interface Submission {
  id: string;
  status_submit: string;
  mahasiswa: { nama_lengkap: string; nim_nip: string } | null;
}

interface BatchAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Submission[];
  onComplete: () => void; // callback to refresh dashboard data
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

// ============================================================
// Component
// ============================================================

export default function BatchAIModal({
  isOpen,
  onClose,
  submissions,
  onComplete,
  onToast,
}: BatchAIModalProps) {
  // --- State ---
  const [selectedModel, setSelectedModel] = useState<AIModel>('MobileNetV2');
  const [filterOnlySubmitted, setFilterOnlySubmitted] = useState(true);
  const [filterSkipFinalized, setFilterSkipFinalized] = useState(true);
  const [filterSkipReupload, setFilterSkipReupload] = useState(true);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Processing state
  const [phase, setPhase] = useState<'config' | 'processing' | 'completed'>('config');
  const [progress, setProgress] = useState<BatchAIProgress | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Computed values ---
  const eligibleSubmissions = submissions.filter(s => {
    if (filterOnlySubmitted && s.status_submit !== 'submitted') return false;
    if (filterSkipFinalized && s.status_submit === 'finalized') return false;
    if (filterSkipReupload && s.status_submit === 'reupload_required') return false;
    return true;
  });

  const eligibleCount = eligibleSubmissions.length;

  // --- Polling logic ---
  const startPolling = useCallback((activeJobId: string, acceptedIds: string[]) => {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    const startedAt = new Date().toISOString();
    let pollCount = 0;

    const schedule = () => {
      const delays = [2000, 3000, 5000];
      const delay = delays[Math.min(pollCount, delays.length - 1)];
      pollCount += 1;
      pollTimeoutRef.current = setTimeout(poll, delay);
    };

    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        schedule();
        return;
      }
      try {
        const response = await apiGet(`/jobs/${activeJobId}`);
        if (!response.ok) {
          schedule();
          return;
        }
        const status = await response.json() as {
          status: 'queued' | 'started' | 'completed' | 'failed';
          progress: number;
          error_code?: string | null;
          completed_ids?: string[];
          failed?: Record<string, string>;
        };
        const percentage = Math.max(0, Math.min(100, status.progress));
        const processedSections = Math.min(
          24,
          Math.floor((percentage / 100) * 24),
        );
        const currentSection = status.status === 'completed'
          ? null
          : ALL_SECTION_CODES[Math.min(processedSections, 23)];
        const terminal = status.status === 'completed' || status.status === 'failed';
        const failedEntries = Object.entries(status.failed ?? {});
        const errors = failedEntries.length > 0
          ? failedEntries.map(([submissionId, errorCode]) => ({
              submissionId,
              sectionCode: currentSection ?? 'S-1A' as const,
              sheetId: 'ALL',
              message: errorCode,
            }))
          : status.status === 'failed'
            ? [{
                submissionId: acceptedIds[0],
                sectionCode: currentSection ?? 'S-1A' as const,
                sheetId: 'ALL',
                message: status.error_code ?? 'AI_JOB_FAILED',
              }]
            : [];
        const completedCount = status.completed_ids?.length
          ?? Math.max(0, acceptedIds.length - errors.length);

        setProgress({
          jobId: activeJobId,
          status: status.status === 'queued'
            ? 'pending'
            : status.status === 'started'
              ? 'processing'
              : status.status,
          model: selectedModel,
          currentSection,
          processedSheetsInSection: terminal ? acceptedIds.length : 0,
          totalSheetsInSection: acceptedIds.length,
          processedSections,
          totalSections: 24,
          totalSubmissions: acceptedIds.length,
          processedSubmissions: terminal
            ? completedCount + errors.length
            : Math.floor((percentage / 100) * acceptedIds.length),
          errors,
          startedAt,
          completedAt: terminal ? new Date().toISOString() : null,
        });

        if (terminal) {
          setPhase('completed');
          const completedWithErrors =
            status.status === 'completed' && errors.length > 0;
          onToast(
            status.status === 'failed'
              ? 'error'
              : completedWithErrors
                ? 'warning'
                : 'success',
            status.status === 'failed'
              ? 'Batch AI Gagal'
              : completedWithErrors
                ? 'Batch AI Selesai Sebagian'
                : 'Batch AI Selesai',
            status.status === 'completed'
              ? `${completedCount} berhasil, ${errors.length} gagal.`
              : 'Worker menghentikan job setelah retry.',
          );
          onComplete();
          return;
        }
      } catch {
        // A transient connectivity failure is retried with backoff.
      }
      schedule();
    };

    void poll();
  }, [selectedModel, onComplete, onToast]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('config');
      setProgress(null);
      setIsStarting(false);
      setIsModelDropdownOpen(false);
    }
  }, [isOpen]);

  // --- Actions ---
  const handleStartBatch = async () => {
    if (eligibleCount === 0) return;

    setIsStarting(true);

    try {
      const submissionIds = eligibleSubmissions.map(s => s.id);

      const res = await apiPost('/predict/batch', {
        submission_ids: submissionIds,
        model: selectedModel,
      });

      if (!res.ok) {
        let errMsg = 'Terjadi kesalahan koneksi ke server.';
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) errMsg = errJson.detail;
        } catch {}
        onToast('error', 'Gagal Memulai Batch', errMsg);
        setIsStarting(false);
        return;
      }

      const data = await res.json() as {
        job_id: string;
        accepted_ids: string[];
        rejected: Record<string, string>;
      };
      if (!data.job_id || data.accepted_ids.length === 0) {
        onToast('error', 'Gagal Memulai Batch', 'Tidak ada submission yang diterima.');
        return;
      }

      setPhase('processing');
      setProgress({
        jobId: data.job_id,
        status: 'processing',
        model: selectedModel,
        currentSection: 'S-1A',
        processedSheetsInSection: 0,
        totalSheetsInSection: data.accepted_ids.length,
        processedSections: 0,
        totalSections: 24,
        totalSubmissions: data.accepted_ids.length,
        processedSubmissions: 0,
        errors: [],
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
      if (Object.keys(data.rejected).length > 0) {
        onToast(
          'warning',
          'Sebagian Submission Ditolak',
          `${Object.keys(data.rejected).length} submission tidak masuk antrean.`,
        );
      }
      startPolling(data.job_id, data.accepted_ids);

    } catch {
      onToast('error', 'Gagal Memulai Batch', 'Terjadi kesalahan koneksi ke server.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleClose = () => {
    if (phase === 'processing') return; // prevent closing during processing
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    onClose();
  };

  // --- Render ---
  const overallPercent = progress
    ? Math.round((progress.processedSections / progress.totalSections) * 100)
    : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal Container */}
          <motion.div
            variants={modalTransition}
            initial="initial"
            animate="animate"
            exit="exit"
            className="bg-[#0A0A0F] border border-neutral-800 rounded-2xl max-w-lg w-full shadow-[0_0_60px_rgba(168,85,247,0.06)] overflow-hidden relative z-10"
          >

        {/* ─── HEADER ─── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-neutral-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Cpu className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Batch AI Processing</h2>
              <p className="text-[11px] text-neutral-500 font-mono tracking-wider mt-0.5">
                SECTION-CENTRIC ORCHESTRATION
              </p>
            </div>
          </div>
          {phase !== 'processing' && (
            <button
              onClick={handleClose}
              className="text-neutral-500 hover:text-white transition-colors p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* ─── BODY ─── */}
        <div className="px-6 py-5">

          {/* ════════════════════════════════════════════ */}
          {/* PHASE: CONFIG                               */}
          {/* ════════════════════════════════════════════ */}
          {phase === 'config' && (
            <div className="space-y-5">

              {/* Model Selector */}
              <div>
                <label className="block text-[10px] font-mono font-bold tracking-widest text-neutral-500 uppercase mb-2">
                  Pilih Model AI
                </label>
                <div className="relative">
                  <button
                    onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                    className="w-full flex items-center justify-between bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white hover:border-purple-500/40 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-purple-400" />
                      <span className="font-semibold">{selectedModel}</span>
                      <span className="text-neutral-500 text-xs">— 24 section models</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isModelDropdownOpen && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-[#0D0D14] border border-neutral-800 rounded-xl overflow-hidden z-10 shadow-xl">
                      {(Object.values(AI_MODELS)).map(m => (
                        <button
                          key={m}
                          onClick={() => { setSelectedModel(m); setIsModelDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center gap-2 ${
                            selectedModel === m
                              ? 'bg-purple-500/10 text-purple-300 font-semibold'
                              : 'text-neutral-300 hover:bg-neutral-900/60 hover:text-white'
                          }`}
                        >
                          <Zap className="w-3.5 h-3.5 text-purple-400" />
                          {m}
                          {selectedModel === m && (
                            <CheckCircle className="w-3.5 h-3.5 ml-auto text-purple-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Filter Checkboxes */}
              <div>
                <label className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-widest text-neutral-500 uppercase mb-3">
                  <Filter className="w-3 h-3" />
                  Filter Pengumpulan
                </label>
                <div className="space-y-2.5">
                  {[
                    { label: 'Hanya status "Menunggu AI" (submitted)', checked: filterOnlySubmitted, setter: setFilterOnlySubmitted },
                    { label: 'Lewati yang sudah Finalized', checked: filterSkipFinalized, setter: setFilterSkipFinalized },
                    { label: 'Lewati yang butuh Re-Upload', checked: filterSkipReupload, setter: setFilterSkipReupload },
                  ].map((filter, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <div
                        onClick={() => filter.setter(!filter.checked)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                          filter.checked
                            ? 'bg-purple-500/20 border-purple-500/50'
                            : 'bg-neutral-950 border-neutral-800 group-hover:border-neutral-700'
                        }`}
                      >
                        {filter.checked && (
                          <CheckCircle className="w-3 h-3 text-purple-400" />
                        )}
                      </div>
                      <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">
                        {filter.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Eligible Count */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-mono font-bold tracking-widest text-neutral-500 uppercase">
                    Pengumpulan Eligible
                  </p>
                  <p className="text-2xl font-black text-white font-mono mt-1">
                    {eligibleCount}
                    <span className="text-sm text-neutral-500 font-normal ml-1.5">tugas</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono text-neutral-500">
                    × 24 sections
                  </p>
                  <p className="text-sm font-mono font-bold text-purple-400 mt-0.5">
                    = {eligibleCount * 24} predictions
                  </p>
                </div>
              </div>

              {/* Start Button */}
              <button
                onClick={handleStartBatch}
                disabled={eligibleCount === 0 || isStarting}
                className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-mono text-sm font-bold tracking-wider transition-all duration-300 cursor-pointer ${
                  eligibleCount === 0
                    ? 'bg-neutral-900 text-neutral-600 border border-neutral-800 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.15)] hover:shadow-[0_0_40px_rgba(168,85,247,0.25)]'
                }`}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Memulai Batch...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Start Batch Processing</span>
                  </>
                )}
              </button>

              {eligibleCount === 0 && (
                <p className="text-xs text-amber-400 text-center">
                  Tidak ada pengumpulan tugas yang cocok dengan filter saat ini.
                </p>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════ */}
          {/* PHASE: PROCESSING                           */}
          {/* ════════════════════════════════════════════ */}
          {phase === 'processing' && progress && (
            <div className="space-y-5">

              {/* Active Model Badge */}
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-4 py-2 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span className="text-xs font-mono font-bold text-purple-300 tracking-wider">
                    {progress.model} ACTIVE
                  </span>
                </div>
              </div>

              {/* Current Section */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-center">
                <p className="text-[10px] font-mono font-bold tracking-widest text-neutral-500 uppercase mb-1">
                  Processing Section
                </p>
                <p className="text-3xl font-black font-mono text-white">
                  {progress.currentSection || '—'}
                </p>
                <p className="text-xs text-neutral-400 mt-1.5">
                  {progress.processedSheetsInSection} / {progress.totalSheetsInSection} lembar dalam section ini
                </p>
              </div>

              {/* Section Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold tracking-widest text-neutral-500 uppercase">
                    Section Progress
                  </span>
                  <span className="text-xs font-mono font-bold text-purple-400">
                    {progress.processedSections} / {progress.totalSections}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${overallPercent}%` }}
                  />
                </div>
              </div>

              {/* Overall Percentage */}
              <div className="flex items-center justify-center">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle
                      className="text-neutral-900"
                      strokeWidth="8"
                      stroke="currentColor"
                      fill="transparent"
                      r="42"
                      cx="50"
                      cy="50"
                    />
                    <circle
                      className="text-purple-500"
                      strokeWidth="8"
                      stroke="currentColor"
                      fill="transparent"
                      r="42"
                      cx="50"
                      cy="50"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      strokeDashoffset={`${2 * Math.PI * 42 * (1 - overallPercent / 100)}`}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-black font-mono text-white">{overallPercent}%</span>
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-mono font-bold tracking-widest text-neutral-500 uppercase">Mahasiswa</p>
                  <p className="text-lg font-black text-white font-mono mt-0.5">
                    {progress.processedSubmissions}
                    <span className="text-sm text-neutral-500 font-normal"> / {progress.totalSubmissions}</span>
                  </p>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-mono font-bold tracking-widest text-neutral-500 uppercase">Errors</p>
                  <p className={`text-lg font-black font-mono mt-0.5 ${
                    progress.errors.length > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {progress.errors.length}
                  </p>
                </div>
              </div>

              {/* Processing message */}
              <div className="flex items-center justify-center gap-2 py-1">
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                <p className="text-xs text-neutral-400 animate-pulse">
                  AI sedang memproses... Jangan tutup jendela ini.
                </p>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════ */}
          {/* PHASE: COMPLETED                            */}
          {/* ════════════════════════════════════════════ */}
          {phase === 'completed' && progress && (
            <div className="space-y-5">

              {/* Success/Warning Badge */}
              <div className="flex items-center justify-center pt-2">
                {progress.errors.length === 0 ? (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-5 py-2.5 rounded-full">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-300">
                      Batch Processing Selesai
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-5 py-2.5 rounded-full">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <span className="text-sm font-bold text-amber-300">
                      Selesai dengan {progress.errors.length} Error
                    </span>
                  </div>
                )}
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-mono font-bold tracking-widest text-neutral-500 uppercase">Model</p>
                  <p className="text-sm font-bold text-purple-400 font-mono mt-1">{progress.model}</p>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-mono font-bold tracking-widest text-neutral-500 uppercase">Tugas</p>
                  <p className="text-sm font-bold text-white font-mono mt-1">{progress.processedSubmissions}</p>
                </div>
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-center">
                  <p className="text-[9px] font-mono font-bold tracking-widest text-neutral-500 uppercase">Sections</p>
                  <p className="text-sm font-bold text-white font-mono mt-1">{progress.processedSections}</p>
                </div>
              </div>

              {/* Errors List */}
              {progress.errors.length > 0 && (
                <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 max-h-32 overflow-y-auto">
                  <p className="text-[10px] font-mono font-bold tracking-widest text-red-400 uppercase mb-2">
                    ⚠ Detail Error ({progress.errors.length})
                  </p>
                  <div className="space-y-1.5">
                    {progress.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-300/80">
                        <span className="font-mono text-red-400">{err.sectionCode}</span>
                        {' — '}
                        {err.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Info Note */}
              <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-3.5 flex items-start gap-2.5">
                <BarChart3 className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300/80 leading-relaxed">
                  Semua tugas telah berstatus <span className="font-bold text-blue-300">Direview</span>.
                  AI prediction bukan nilai akhir — dosen tetap dapat mengoreksi nilai per section
                  sebelum melakukan finalisasi.
                </p>
              </div>

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="w-full py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white font-bold text-sm transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Processing phase without progress data yet */}
          {phase === 'processing' && !progress && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
              <p className="text-sm text-neutral-400 animate-pulse">Menghubungkan ke server...</p>
            </div>
          )}

          </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
