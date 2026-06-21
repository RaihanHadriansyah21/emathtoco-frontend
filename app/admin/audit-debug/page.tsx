'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Loader2, ShieldCheck, ShieldAlert, 
  ArrowLeft, RefreshCw, Terminal
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { apiGet } from '@/lib/api-client';
import PageTransition from '@/components/ui/PageTransition';

export default function AuditDebugPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  
  // Debug State
  const [schemaVersion, setSchemaVersion] = useState<'legacy' | 'enterprise' | null>(null);
  const [columnsFound, setColumnsFound] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Stats
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const [totalLoginCount, setTotalLoginCount] = useState(0);
  const [totalAIRunCount, setTotalAIRunCount] = useState(0);
  const [totalFinalizedCount, setTotalFinalizedCount] = useState(0);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // 1. Check Schema
      const schemaRes = await apiGet('/audit/schema-check');
      let currentSchema: 'legacy' | 'enterprise' = 'enterprise';
      if (schemaRes.ok) {
        const schemaData = await schemaRes.json();
        setSchemaVersion(schemaData.schema_version);
        setColumnsFound(schemaData.columns_found);
        currentSchema = schemaData.schema_version;
      } else {
        setSchemaVersion('enterprise');
        setColumnsFound(['id', 'user_id', 'user_name', 'role', 'action', 'target', 'detail', 'created_at']);
      }

      // 2. Fetch Stats based on enterprise schema
      const { count: total } = await supabase.from('audit_log').select('*', { count: 'exact', head: true });
      setTotalLogsCount(total || 0);

      const { count: logins } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
        .or('action.in.("ADMIN_LOGIN","LECTURER_LOGIN","STUDENT_LOGIN")');
      setTotalLoginCount(logins || 0);

      const { count: aiRuns } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
        .or('action.in.("AI_PROCESS_STARTED","AI_PROCESS_COMPLETED","AI_PROCESS_FAILED")');
      setTotalAIRunCount(aiRuns || 0);

      const { count: finalized } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
        .eq('action', 'FINAL_SCORE_SUBMITTED');
      setTotalFinalizedCount(finalized || 0);
    } catch (err) {
      console.error('Error fetching debug schema details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-8">
      {/* Back to Audit Log */}
      <button 
        onClick={() => router.push('/admin/audit')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Audit Log
      </button>

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-neutral-900 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Terminal className="w-6 h-6 text-cyan-500" />
            Audit Schema Debugger
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">
            Validasi real-time struktur kolom tabel audit log dan statistik data.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-500 dark:text-neutral-400 disabled:opacity-50 transition-all cursor-pointer inline-flex items-center gap-2 border border-slate-200 dark:border-neutral-800 text-xs font-semibold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Schema Version Card */}
          <div className="md:col-span-2 bg-white dark:bg-[#0A0A0F]/60 border border-slate-200 dark:border-neutral-900/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest">
                  Status Skema Database
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  Active Schema Version
                </h2>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase border ${
                schemaVersion === 'enterprise' 
                  ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
                  : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
              }`}>
                {schemaVersion === 'enterprise' ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Enterprise Skema
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    Legacy Skema
                  </>
                )}
              </span>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-neutral-300">
                Kolom Terdeteksi ({columnsFound.length}):
              </span>
              <div className="flex flex-wrap gap-2">
                {columnsFound.map(col => {
                  const isNewCol = ['user_id', 'user_name', 'role', 'action', 'target', 'detail'].includes(col);
                  return (
                    <span 
                      key={col} 
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono border ${
                        isNewCol
                          ? 'text-cyan-500 bg-cyan-500/5 border-cyan-500/20 dark:text-cyan-400 dark:bg-cyan-400/5'
                          : 'text-slate-500 bg-slate-50 border-slate-200 dark:text-neutral-400 dark:bg-neutral-900/40 dark:border-neutral-800'
                      }`}
                    >
                      {col} {isNewCol && '★'}
                    </span>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-450 dark:text-neutral-550 italic mt-2">
                * Kolom bertanda bintang (★) adalah kolom skema Enterprise baru.
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="bg-white dark:bg-[#0A0A0F]/60 border border-slate-200 dark:border-neutral-900/80 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-widest">
                  Metadata Status
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  Jumlah Rekam Data
                </h2>
              </div>
              
              <div className="space-y-2.5 divide-y divide-slate-100 dark:divide-neutral-900/50">
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-neutral-400">Total Logs</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white font-mono">{totalLogsCount}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-neutral-400">Total Login</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white font-mono">{totalLoginCount}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-neutral-400">AI Process</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white font-mono">{totalAIRunCount}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-neutral-400">Finalisasi</span>
                  <span className="text-sm font-extrabold text-slate-800 dark:text-white font-mono">{totalFinalizedCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </PageTransition>
  );
}
