'use client';

import React, { useState, useMemo } from 'react';
import {
  X, Download, Loader2, Filter, CheckCircle, FileSpreadsheet, ChevronDown
} from 'lucide-react';
import { generateExportCSV, downloadCSV, type ExportFilters } from '@/lib/export/generate-csv';
import { generateExportExcel, downloadExcel } from '@/lib/export/generate-excel';

// ============================================================
// Types
// ============================================================

interface Submission {
  id: string;
  status_submit: string;
  model_ai: string | null;
  mahasiswa: { kelas: string } | null;
  mata_kuliah: { nama_matkul: string; kode_matkul: string } | null;
  mata_kuliah_id?: string;
}

interface ExportCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissions: Submission[];
  onToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

// ============================================================
// Component
// ============================================================

export default function ExportCSVModal({
  isOpen,
  onClose,
  submissions,
  onToast,
}: ExportCSVModalProps) {
  const [finalizedOnly, setFinalizedOnly] = useState(true);
  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [selectedMataKuliah, setSelectedMataKuliah] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isKelasOpen, setIsKelasOpen] = useState(false);
  const [isMKOpen, setIsMKOpen] = useState(false);

  // Derive available filter options from submissions
  const availableKelas = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => {
      if (s.mahasiswa?.kelas) set.add(s.mahasiswa.kelas);
    });
    return [...set].sort();
  }, [submissions]);

  const availableMataKuliah = useMemo(() => {
    const map = new Map<string, { nama: string; kode: string; id: string }>();
    submissions.forEach(s => {
      if (s.mata_kuliah && s.mata_kuliah_id && !map.has(s.mata_kuliah_id)) {
        map.set(s.mata_kuliah_id, {
          nama: s.mata_kuliah.nama_matkul,
          kode: s.mata_kuliah.kode_matkul,
          id: s.mata_kuliah_id,
        });
      }
    });
    return [...map.values()];
  }, [submissions]);

  const availableModels = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach(s => {
      if (s.model_ai) set.add(s.model_ai);
    });
    return [...set].sort();
  }, [submissions]);

  // Estimate eligible count
  const eligibleCount = useMemo(() => {
    return submissions.filter(s => {
      if (finalizedOnly && s.status_submit !== 'finalized') return false;
      if (selectedKelas && s.mahasiswa?.kelas !== selectedKelas) return false;
      if (selectedMataKuliah && s.mata_kuliah_id !== selectedMataKuliah) return false;
      if (selectedModel && s.model_ai !== selectedModel) return false;
      return true;
    }).length;
  }, [submissions, finalizedOnly, selectedKelas, selectedMataKuliah, selectedModel]);

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    try {
      const filters: ExportFilters = {
        finalizedOnly,
        kelas: selectedKelas || undefined,
        mataKuliahId: selectedMataKuliah || undefined,
        modelAi: selectedModel || undefined,
      };

      const { csv, filename, count } = await generateExportCSV(filters);
      downloadCSV(csv, filename);

      onToast('success', 'Export CSV Berhasil', `${count} data mahasiswa berhasil diekspor ke ${filename}`);
      onClose();
    } catch (err) {
      console.error('[CSV Export] Error:', err);
      onToast('error', 'Export CSV Gagal', err instanceof Error ? err.message : 'Terjadi kesalahan saat mengekspor data.');
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    try {
      const filters: ExportFilters = {
        finalizedOnly,
        kelas: selectedKelas || undefined,
        mataKuliahId: selectedMataKuliah || undefined,
        modelAi: selectedModel || undefined,
      };

      const { buffer, filename, count } = await generateExportExcel(filters);
      downloadExcel(buffer, filename);

      onToast('success', 'Export Excel Berhasil', `${count} data mahasiswa berhasil diekspor ke ${filename}`);
      onClose();
    } catch (err) {
      console.error('[Excel Export] Error:', err);
      onToast('error', 'Export Excel Gagal', err instanceof Error ? err.message : 'Terjadi kesalahan saat mengekspor data.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-neutral-800 rounded-2xl max-w-lg w-full shadow-[0_0_60px_rgba(16,185,129,0.04)] overflow-hidden">

        {/* ─── HEADER ─── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-200 dark:border-neutral-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Export Rekap Nilai</h2>
              <p className="text-[11px] text-slate-400 dark:text-neutral-500 font-mono tracking-wider mt-0.5">
                CSV &amp; EXCEL FORMATS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 dark:text-neutral-500 dark:hover:text-white transition-colors p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ─── BODY ─── */}
        <div className="px-6 py-5 space-y-5">

          {/* Filter Section */}
          <div>
            <label className="flex items-center gap-2 text-[10px] font-mono font-bold tracking-widest text-slate-400 dark:text-neutral-500 uppercase mb-3">
              <Filter className="w-3 h-3" />
              Filter Export
            </label>

            {/* Finalized Only Toggle */}
            <label className="flex items-center gap-3 cursor-pointer group mb-3">
              <div
                onClick={() => setFinalizedOnly(!finalizedOnly)}
                className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                  finalizedOnly
                    ? 'bg-emerald-500/20 border-emerald-500/50'
                    : 'bg-slate-50 border-slate-250 dark:bg-neutral-950 dark:border-neutral-800 group-hover:border-slate-350 dark:group-hover:border-neutral-700'
                }`}
              >
                {finalizedOnly && <CheckCircle className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />}
              </div>
              <span className="text-sm text-slate-700 group-hover:text-slate-900 dark:text-neutral-300 dark:group-hover:text-white transition-colors">
                Hanya data Finalized
              </span>
            </label>

            {/* Kelas Dropdown */}
            <div className="relative mb-3">
              <button
                onClick={() => { setIsKelasOpen(!isKelasOpen); setIsMKOpen(false); }}
                className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 hover:border-emerald-500/40 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-300 transition-colors cursor-pointer"
              >
                <span>{selectedKelas || 'Semua Kelas'}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-neutral-500 transition-transform ${isKelasOpen ? 'rotate-180' : ''}`} />
              </button>
              {isKelasOpen && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 dark:bg-[#0D0D14] dark:border-neutral-800 rounded-xl overflow-hidden z-10 shadow-xl max-h-40 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedKelas(''); setIsKelasOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${
                      !selectedKelas ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-semibold' : 'text-slate-700 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-900/60'
                    }`}
                  >
                    Semua Kelas
                  </button>
                  {availableKelas.map(k => (
                    <button
                      key={k}
                      onClick={() => { setSelectedKelas(k); setIsKelasOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${
                        selectedKelas === k ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-semibold' : 'text-slate-700 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-900/60'
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mata Kuliah Dropdown */}
            {availableMataKuliah.length > 1 && (
              <div className="relative mb-3">
                <button
                  onClick={() => { setIsMKOpen(!isMKOpen); setIsKelasOpen(false); }}
                  className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 hover:border-emerald-500/40 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-300 transition-colors cursor-pointer"
                >
                  <span>
                    {selectedMataKuliah
                      ? availableMataKuliah.find(m => m.id === selectedMataKuliah)?.nama || 'Dipilih'
                      : 'Semua Mata Kuliah'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-neutral-500 transition-transform ${isMKOpen ? 'rotate-180' : ''}`} />
                </button>
                {isMKOpen && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 dark:bg-[#0D0D14] dark:border-neutral-800 rounded-xl overflow-hidden z-10 shadow-xl max-h-40 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedMataKuliah(''); setIsMKOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${
                        !selectedMataKuliah ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-semibold' : 'text-slate-700 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-900/60'
                      }`}
                    >
                      Semua Mata Kuliah
                    </button>
                    {availableMataKuliah.map(mk => (
                      <button
                        key={mk.id}
                        onClick={() => { setSelectedMataKuliah(mk.id); setIsMKOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors cursor-pointer ${
                          selectedMataKuliah === mk.id ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 font-semibold' : 'text-slate-700 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-900/60'
                        }`}
                      >
                        {mk.nama} <span className="text-slate-400 dark:text-neutral-500 text-xs font-mono ml-1">({mk.kode})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Model AI filter */}
            {availableModels.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedModel('')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !selectedModel
                      ? 'bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-100 border border-slate-205 dark:bg-neutral-950 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 hover:border-slate-300 dark:hover:border-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-900'
                  }`}
                >
                  All Models
                </button>
                {availableModels.map(m => (
                  <button
                    key={m}
                    onClick={() => setSelectedModel(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedModel === m
                        ? 'bg-purple-500/10 dark:bg-purple-500/15 border border-purple-500/30 text-purple-650 dark:text-purple-400'
                        : 'bg-slate-100 border border-slate-205 dark:bg-neutral-950 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 hover:border-slate-300 dark:hover:border-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-900'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Eligible Count */}
          <div className="bg-slate-50 border border-slate-200 dark:bg-neutral-950 dark:border-neutral-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono font-bold tracking-widest text-slate-400 dark:text-neutral-500 uppercase">
                Data Eligible
              </p>
              <p className="text-2xl font-black text-slate-800 dark:text-white font-mono mt-1">
                {eligibleCount}
                <span className="text-sm text-slate-500 dark:text-neutral-500 font-normal ml-1.5">mahasiswa</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono text-slate-400 dark:text-neutral-500">
                × 24 sections + metadata
              </p>
              <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                = {eligibleCount > 0 ? `${eligibleCount * 24 + eligibleCount * 4} cells` : '0 cells'}
              </p>
            </div>
          </div>

          {/* Export Preview Info */}
          <div className="bg-emerald-50 dark:bg-emerald-950/15 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-3.5 flex items-start gap-2.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-700 dark:text-emerald-300/80 leading-relaxed">
              <p>Pilih format untuk rekap nilai akademik. <strong>Excel (.xlsx)</strong> menyertakan visual layout profesional dengan merged title, pembekuan header, dan pewarnaan status. <strong>CSV (.csv)</strong> mengekspor file data tabular standar.</p>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* CSV Export Button */}
            <button
              onClick={handleExportCSV}
              disabled={eligibleCount === 0 || isExportingCSV || isExportingExcel}
              className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-mono text-xs font-bold tracking-wider transition-all duration-300 cursor-pointer ${
                eligibleCount === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-205 dark:bg-neutral-900 dark:text-neutral-600 dark:border-neutral-800 cursor-not-allowed w-full'
                  : 'bg-emerald-50/50 dark:bg-[#0D1E16] border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100/50 dark:hover:bg-emerald-500/10 hover:text-slate-800 dark:hover:text-white w-full'
              }`}
            >
              {isExportingCSV ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>CSV...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </>
              )}
            </button>

            {/* Excel Export Button */}
            <button
              onClick={handleExportExcel}
              disabled={eligibleCount === 0 || isExportingCSV || isExportingExcel}
              className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-mono text-xs font-bold tracking-wider transition-all duration-300 cursor-pointer ${
                eligibleCount === 0
                  ? 'bg-slate-100 text-slate-400 border border-slate-205 dark:bg-neutral-900 dark:text-neutral-600 dark:border-neutral-800 cursor-not-allowed w-full'
                  : 'bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.15)] hover:shadow-[0_0_30px_rgba(6,182,212,0.25)] w-full'
              }`}
            >
              {isExportingExcel ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Excel...</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel</span>
                </>
              )}
            </button>
          </div>

          {eligibleCount === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
              Tidak ada data yang cocok dengan filter saat ini.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
