'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, Loader2, BarChart3, Hash, Award, CheckCircle2, Layers, BrainCircuit, Code2, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { createAuditLog, standardizeModelName } from '@/lib/services/audit-service';
import { fetchAvailableModels } from '@/lib/services/model-service';
import { fetchModelsInfo, type ModelInfo } from '@/lib/services/model-info-service';
import { apiGet, apiPost } from '@/lib/api-client';
import { GlassTable, GlassTableHeader, GlassTableRow, ResponsiveTableWrapper } from '@/components/ui/table';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';

interface ModelStat {
  model_name: string;
  count: number;
  avg_score: number | null;
  finalized_count: number;
}

/** Color themes for each model card — visually distinguishes architectures */
const MODEL_THEMES: Record<string, { gradient: string; border: string; icon: string; bg: string }> = {
  DenseNet121: {
    gradient: 'from-purple-500/15 to-violet-500/5',
    border: 'border-purple-500/25',
    icon: 'text-purple-500 dark:text-purple-400',
    bg: 'bg-purple-500/10',
  },
  InceptionV3: {
    gradient: 'from-cyan-500/15 to-blue-500/5',
    border: 'border-cyan-500/25',
    icon: 'text-cyan-500 dark:text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
  MobileNetV2: {
    gradient: 'from-emerald-500/15 to-teal-500/5',
    border: 'border-emerald-500/25',
    icon: 'text-emerald-500 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
};

const DEFAULT_THEME = {
  gradient: 'from-slate-500/15 to-gray-500/5',
  border: 'border-slate-500/25',
  icon: 'text-slate-500 dark:text-slate-400',
  bg: 'bg-slate-500/10',
};

function getModelTheme(name: string) {
  return MODEL_THEMES[name] || DEFAULT_THEME;
}

export default function AIModelInventoryPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [models, setModels] = useState<ModelStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // FastAPI backend state — available models (dropdown)
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingBackend, setIsLoadingBackend] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  
  // Admin details for audit logs
  const [adminName, setAdminName] = useState<string>('Administrator');
  const [adminRole, setAdminRole] = useState<string>('admin');
  const [adminId, setAdminId] = useState<string | null>(null);

  const loadActiveModelFromDB = async () => {
    try {
      const res = await apiGet('/settings');
      if (res.ok) {
        const settings = await res.json();
        if (settings.active_model) {
          setSelectedModel(settings.active_model);
        }
      }
    } catch (err) {
      console.error('Failed to load active model setting:', err);
    }
  };

  const handleModelChange = async (newModel: string) => {
    const oldModel = selectedModel;
    if (oldModel === newModel) return;
    
    // Optimistic Update
    setSelectedModel(newModel);
    
    try {
      const payload = {
        changed_by: adminName,
        role: adminRole,
        user_id: adminId,
        settings: {
          active_model: newModel
        }
      };
      
      const res = await apiPost('/settings', payload);
      if (!res.ok) {
        throw new Error('Failed to save settings');
      }
    } catch (err) {
      console.error('Failed to update active model:', err);
      // Rollback
      setSelectedModel(oldModel);
    }
  };

  // FastAPI backend state — model info (cards)
  const [modelsInfo, setModelsInfo] = useState<ModelInfo[]>([]);
  const [isLoadingModelsInfo, setIsLoadingModelsInfo] = useState(false);
  const [modelsInfoError, setModelsInfoError] = useState<string | null>(null);

  // Derived: find the ModelInfo entry for the selected model
  const selectedModelInfo = useMemo(() => {
    if (!selectedModel) return null;
    return modelsInfo.find((m) => m.name === selectedModel) || null;
  }, [selectedModel, modelsInfo]);

  // Derived: predict request payload preview
  const predictPayload = useMemo(() => {
    if (!selectedModel) return null;
    return { model_type: selectedModel };
  }, [selectedModel]);

  // ────────────────────────────────────────────
  // Data Loaders
  // ────────────────────────────────────────────

  const loadBackendModels = async () => {
    setIsLoadingBackend(true);
    setBackendError(null);
    try {
      const data = await fetchAvailableModels();
      setAvailableModels(data.models || []);
    } catch (err: any) {
      console.error('Error fetching backend models:', err);
      setBackendError(err.message || 'Gagal memuat model dari server backend.');
    } finally {
      setIsLoadingBackend(false);
    }
  };

  const loadModelsInfo = async () => {
    setIsLoadingModelsInfo(true);
    setModelsInfoError(null);
    try {
      const data = await fetchModelsInfo();
      setModelsInfo(data.models || []);
    } catch (err: any) {
      console.error('Error fetching models info:', err);
      setModelsInfoError(err.message || 'Gagal memuat informasi model.');
    } finally {
      setIsLoadingModelsInfo(false);
    }
  };

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setAdminId(user.id);
          const { data: profile } = await supabase.from('profil_pengguna').select('nama_lengkap, role').eq('id', user.id).maybeSingle();
          if (profile?.nama_lengkap) {
            setAdminName(profile.nama_lengkap);
          }
          if (profile?.role) {
            setAdminRole(normalizeRole(profile.role));
          }
        }
      } catch (err) {
        console.error('Error fetching admin session details:', err);
      }
    };
    fetchSession();
    fetchModelsFromDB();
    loadBackendModels();
    loadModelsInfo();
    loadActiveModelFromDB();
  }, []);

  const fetchModelsFromDB = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('pengumpulan_tugas')
        .select('model_ai, nilai_akhir, status_submit');
      if (error) throw error;

      // Aggregate by model
      const map = new Map<string, { count: number; scores: number[]; finalized: number }>();
      (data || []).forEach(sub => {
        const name = sub.model_ai || 'Belum Diproses';
        const entry = map.get(name) || { count: 0, scores: [], finalized: 0 };
        entry.count++;
        if (sub.nilai_akhir !== null) entry.scores.push(sub.nilai_akhir);
        if (sub.status_submit === 'finalized') entry.finalized++;
        map.set(name, entry);
      });

      const stats: ModelStat[] = Array.from(map.entries()).map(([name, entry]) => ({
        model_name: name,
        count: entry.count,
        avg_score: entry.scores.length > 0 ? Math.round((entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length) * 100) / 100 : null,
        finalized_count: entry.finalized,
      })).sort((a, b) => b.count - a.count);

      setModels(stats);
    } catch (err) {
      console.error('Error fetching AI models:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const maxCount = Math.max(...models.map(m => m.count), 1);

  if (isChecking) {
    return <PageLoader message="Memverifikasi admin..." />;
  }

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Cpu className="w-6 h-6 text-purple-500 dark:text-purple-400" />
          Inventaris Model AI
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Registry model AI yang digunakan oleh sistem penilaian otomatis.</p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* SECTION 1: Model Configuration (Dropdown)                */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-neutral-350 uppercase tracking-widest flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-500 dark:text-purple-400" />
            Konfigurasi Model Aktif (Engine AI)
          </h2>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1">
            Pilih model klasifikasi gambar yang terdaftar pada backend server FastAPI.
          </p>
        </div>

        {isLoadingBackend ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-neutral-400">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-500 dark:text-cyan-400" />
            <span>Menghubungkan ke server backend FastAPI...</span>
          </div>
        ) : backendError ? (
          <div className="bg-red-500/5 border border-red-500/20 text-red-500 dark:text-red-400 p-4 rounded-xl text-xs space-y-2">
            <p className="font-semibold text-red-650 dark:text-red-400">Koneksi Backend Gagal:</p>
            <p>{backendError}</p>
            <button
              onClick={loadBackendModels}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg font-bold transition-all cursor-pointer"
            >
              Coba Hubungkan Kembali
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-w-xs">
              <select
                id="model-selector"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all cursor-pointer"
              >
                <option value="">Select Model</option>
                {availableModels.map((model) => (
                  <option key={model} value={model}>
                    ▼ {model}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* SECTION 2: Model Information Cards (from /models-info)   */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-widest flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
          Model Registry (Backend)
        </h2>

        {isLoadingModelsInfo ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-neutral-400 py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500 dark:text-cyan-400" />
            <span>Memuat informasi model...</span>
          </div>
        ) : modelsInfoError ? (
          <div className="bg-red-500/5 border border-red-500/20 text-red-500 dark:text-red-400 p-4 rounded-xl text-xs space-y-2">
            <p className="font-semibold">Gagal memuat model info:</p>
            <p>{modelsInfoError}</p>
            <button
              onClick={loadModelsInfo}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 dark:text-red-400 rounded-lg font-bold transition-all cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : modelsInfo.length === 0 ? (
          <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl py-12 text-center text-slate-400 dark:text-neutral-500 text-sm">
            Tidak ada model yang terdaftar di backend.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modelsInfo.map((info) => {
              const theme = getModelTheme(info.name);
              const isSelected = selectedModel === info.name;

              return (
                <button
                  key={info.name}
                  id={`model-card-${info.name}`}
                  type="button"
                  onClick={() => handleModelChange(info.name)}
                  className={`
                    relative text-left w-full
                    bg-white dark:bg-[#0A0A0F]
                    dark:bg-gradient-to-b dark:${theme.gradient}
                    border-2 rounded-2xl p-5 shadow-lg
                    transition-all duration-300 cursor-pointer
                    hover:shadow-xl hover:scale-[1.02]
                    ${isSelected
                      ? `${theme.border} ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0A0A0F] ring-current ${theme.icon}`
                      : 'border-slate-200 dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700'
                    }
                  `}
                >
                  {/* Selected indicator */}
                  {isSelected && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className={`w-5 h-5 ${theme.icon}`} />
                    </div>
                  )}

                  {/* Model Icon */}
                  <div className={`w-10 h-10 rounded-xl ${theme.bg} flex items-center justify-center mb-4`}>
                    <BrainCircuit className={`w-5 h-5 ${theme.icon}`} />
                  </div>

                  {/* Model Name */}
                  <h3 className="text-lg font-extrabold text-slate-800 dark:text-white tracking-tight">
                    {info.name}
                  </h3>

                  {/* File Count */}
                  <div className="flex items-center gap-2 mt-2">
                    <Layers className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500" />
                    <span className="text-sm font-mono font-semibold text-slate-600 dark:text-neutral-300">
                      {info.total_files} Models
                    </span>
                  </div>

                  {/* Status Badge */}
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                      READY
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* SECTION 3: Selected Model Summary                        */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {selectedModel && (
        <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-5">
          <h2 className="text-sm font-bold text-slate-700 dark:text-neutral-300 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            Model Terpilih
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Selected Model Name */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">
                Selected Model
              </span>
              <div className="flex items-center gap-2">
                <BrainCircuit className={`w-4 h-4 ${getModelTheme(selectedModel).icon}`} />
                <span className="text-xl font-extrabold text-slate-800 dark:text-white font-mono">
                  {selectedModel}
                </span>
              </div>
            </div>

            {/* Available Sections */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">
                Available Sections
              </span>
              <span className="text-xl font-extrabold text-slate-800 dark:text-white font-mono block">
                {selectedModelInfo?.total_files ?? '—'}
              </span>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">
                Status
              </span>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  READY
                </span>
              </div>
            </div>
          </div>

          {/* Predict Payload Preview */}
          {predictPayload && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-2">
                <Code2 className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-500" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">
                  Predict Request Payload (Preview)
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-neutral-800 rounded-xl p-4 font-mono text-xs text-slate-700 dark:text-neutral-300 overflow-x-auto">
                <pre>{JSON.stringify(predictPayload, null, 2)}</pre>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-neutral-500 mt-2 flex items-center gap-1">
                <ChevronRight className="w-3 h-3" />
                Payload ini akan dikirim ke <code className="text-cyan-600 dark:text-cyan-400 font-bold">POST /predict</code> pada tahap berikutnya.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {/* SECTION 4: Usage Statistics (existing — unchanged logic) */}
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>
      ) : models.length === 0 ? (
        <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl py-12 text-center text-slate-400 dark:text-neutral-500 text-sm">Belum ada data model AI.</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-purple-500/10 dark:to-indigo-500/5 border border-slate-200 dark:border-purple-500/15 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Total Model</span>
                <BarChart3 className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              </div>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-white font-mono">{models.length}</span>
            </div>
            <div className="bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-cyan-500/10 dark:to-blue-500/5 border border-slate-200 dark:border-cyan-500/15 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Total Penggunaan</span>
                <Hash className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-white font-mono">{models.reduce((s, m) => s + m.count, 0)}</span>
            </div>
            <div className="bg-white dark:bg-[#0A0A0F] dark:bg-gradient-to-b dark:from-emerald-500/10 dark:to-teal-500/5 border border-slate-200 dark:border-emerald-500/15 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Total Finalized</span>
                <Award className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
              <span className="text-3xl font-extrabold text-slate-800 dark:text-white font-mono">{models.reduce((s, m) => s + m.finalized_count, 0)}</span>
            </div>
          </div>

          {/* Model Bar Chart */}
          <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 shadow-xl backdrop-blur-md">
            <h2 className="text-sm font-bold text-slate-600 dark:text-neutral-300 uppercase tracking-widest mb-5">Distribusi Penggunaan Model</h2>
            <div className="space-y-4">
              {models.map((m, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">{m.model_name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="font-mono text-slate-500 dark:text-neutral-400">{m.count} penggunaan</span>
                      {m.avg_score !== null && (
                        <span className="font-mono text-emerald-600 dark:text-emerald-400">avg: {m.avg_score}</span>
                      )}
                    </div>
                  </div>
                  <div className="h-3 bg-slate-100 dark:bg-neutral-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${(m.count / maxCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table Detail */}
          <ResponsiveTableWrapper className="bg-white dark:bg-[#0A0A0F]/80 shadow-xl">
            <GlassTable className="min-w-[650px]">
              <GlassTableHeader>
                <tr>
                  <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 whitespace-nowrap">Model AI</th>
                  <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 text-center whitespace-nowrap">Penggunaan</th>
                  <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 text-center whitespace-nowrap">Rata-rata Nilai</th>
                  <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-550 dark:text-neutral-450 text-center whitespace-nowrap">Finalized</th>
                </tr>
              </GlassTableHeader>
              <tbody>
                {models.map((m, idx) => (
                  <GlassTableRow key={idx} hoverable={true}>
                    <td className="py-3.5 px-5 text-sm font-semibold text-slate-850 dark:text-neutral-200 whitespace-nowrap">{m.model_name}</td>
                    <td className="py-3.5 px-5 text-center text-sm font-mono text-slate-600 dark:text-neutral-450 whitespace-nowrap">{m.count}</td>
                    <td className="py-3.5 px-5 text-center text-sm font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{m.avg_score !== null ? m.avg_score : '-'}</td>
                    <td className="py-3.5 px-5 text-center text-sm font-mono text-slate-650 dark:text-neutral-400 whitespace-nowrap">{m.finalized_count}</td>
                  </GlassTableRow>
                ))}
              </tbody>
            </GlassTable>
          </ResponsiveTableWrapper>
        </>
      )}
    </div>
    </PageTransition>
  );
}
