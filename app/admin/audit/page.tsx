'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FileText, Loader2, Search, ChevronLeft, ChevronRight, X,
  Database, UserCheck, ShieldAlert, Cpu, Award, RefreshCcw, Eye, Calendar, User, Tag, BookOpen,
  Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { standardizeModelName } from '@/lib/services/audit-service';
import { apiGet } from '@/lib/api-client';
import { GlassTable, GlassTableHeader, GlassTableRow, EmptyState, ResponsiveTableWrapper } from '@/components/ui/table';
import { motion, AnimatePresence } from 'framer-motion';
import { fadeIn, modalTransition } from '@/styles/motion';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';

interface AuditEntry {
  id: string;
  created_at: string;
  
  // New schema fields
  user_id?: string | null;
  user_name?: string | null;
  role?: string | null;
  action?: string | null;
  target?: string | null;
  detail?: any;
  
  // Old schema fields for backwards compatibility
  actor_id?: string | null;
  actor_role?: string | null;
  action_type?: string | null;
  target_type?: string | null;
  description?: string | null;
  
  // Custom join field
  admin_name?: string;
}

const PAGE_SIZE = 100;

export default function AuditLogPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  
  // Schema Checking State
  const [schemaVersion, setSchemaVersion] = useState<'legacy' | 'enterprise' | null>(null);
  const [columnsFound, setColumnsFound] = useState<string[]>([]);

  // Logs & Pagination State
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAuditTable, setHasAuditTable] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  
  // Sidang / Demo Mode Statistics State
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const [totalLoginCount, setTotalLoginCount] = useState(0);
  const [totalAIRunCount, setTotalAIRunCount] = useState(0);
  const [totalFinalizedCount, setTotalFinalizedCount] = useState(0);
  const [totalResetCount, setTotalResetCount] = useState(0);

  // Detail Modal state
  const [selectedLog, setSelectedLog] = useState<AuditEntry | null>(null);

  // Auth Guard
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

  // Check Schema Version
  useEffect(() => {
    const checkSchema = async () => {
      try {
        const res = await apiGet('/audit/schema-check');
        if (res.ok) {
          const data = await res.json();
          setSchemaVersion(data.schema_version);
          setColumnsFound(data.columns_found);
        } else {
          setSchemaVersion('legacy');
        }
      } catch (err) {
        console.error('Failed to check audit schema:', err);
        setSchemaVersion('legacy');
      }
    };
    if (!isChecking) {
      checkSchema();
    }
  }, [isChecking]);

  // Debounce Search Input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [actionFilter, debouncedSearchQuery]);

  // Fetch paginated logs and statistics
  useEffect(() => {
    if (!isChecking && schemaVersion !== null) {
      fetchLogs(currentPage);
      fetchStats();
    }
  }, [isChecking, currentPage, actionFilter, debouncedSearchQuery, schemaVersion]);

  const fetchLogs = async (page: number) => {
    setIsLoading(true);
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let queryBuilder = supabase
        .from('audit_log')
        .select('*', { count: 'exact' });

      if (schemaVersion === 'enterprise') {
        // Apply action filter safely on both old and new columns
        if (actionFilter !== 'all') {
          queryBuilder = queryBuilder.or(`action.eq."${actionFilter}",action_type.eq."${actionFilter}"`);
        }

        // Apply text search term (server-side filtering across fields)
        if (debouncedSearchQuery.trim()) {
          const queryTerm = `%${debouncedSearchQuery.trim()}%`;
          queryBuilder = queryBuilder.or(
            `user_name.ilike."${queryTerm}",` +
            `role.ilike."${queryTerm}",` +
            `action.ilike."${queryTerm}",` +
            `target.ilike."${queryTerm}",` +
            `description.ilike."${queryTerm}",` +
            `actor_role.ilike."${queryTerm}",` +
            `action_type.ilike."${queryTerm}",` +
            `target_type.ilike."${queryTerm}"`
          );
        }
      } else {
        // LEGACY SCHEMA FALLBACK
        if (actionFilter !== 'all') {
          queryBuilder = queryBuilder.eq('action_type', actionFilter);
        }

        if (debouncedSearchQuery.trim()) {
          const queryTerm = `%${debouncedSearchQuery.trim()}%`;
          queryBuilder = queryBuilder.or(
            `description.ilike."${queryTerm}",` +
            `actor_role.ilike."${queryTerm}",` +
            `action_type.ilike."${queryTerm}",` +
            `target_type.ilike."${queryTerm}"`
          );
        }
      }

      const { data, count, error } = await queryBuilder
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setHasAuditTable(false);
        }
        console.error('Error fetching audit logs:', error);
        setLogs([]);
        setTotalCount(0);
        return;
      }

      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      // 1. Total logs count
      const { count: total } = await supabase.from('audit_log').select('*', { count: 'exact', head: true });
      setTotalLogsCount(total || 0);

      if (schemaVersion === 'enterprise') {
        // 2. Total logins count (admin + lecturer + student logins)
        const { count: logins } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .or('action.in.("ADMIN_LOGIN","LECTURER_LOGIN","STUDENT_LOGIN"),action_type.in.("ADMIN_LOGIN","LECTURER_LOGIN","STUDENT_LOGIN")');
        setTotalLoginCount(logins || 0);

        // 3. Total AI Run count (started + completed + failed)
        const { count: aiRuns } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .or('action.in.("AI_PROCESS_STARTED","AI_PROCESS_COMPLETED","AI_PROCESS_FAILED"),action_type.in.("AI_PROCESS_STARTED","AI_PROCESS_COMPLETED","AI_PROCESS_FAILED")');
        setTotalAIRunCount(aiRuns || 0);

        // 4. Total Finalisasi count
        const { count: finalized } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .or('action.eq."FINAL_SCORE_SUBMITTED",action_type.eq."FINAL_SCORE_SUBMITTED"');
        setTotalFinalizedCount(finalized || 0);

        // 5. Total Reset count
        const { count: resets } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .or('action.eq."SYSTEM_RESET",action_type.eq."SYSTEM_RESET"');
        setTotalResetCount(resets || 0);
      } else {
        // LEGACY SCHEMA FALLBACK
        const { count: logins } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .in('action_type', ['ADMIN_LOGIN', 'LECTURER_LOGIN', 'STUDENT_LOGIN']);
        setTotalLoginCount(logins || 0);

        const { count: aiRuns } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .in('action_type', ['AI_PROCESS_STARTED', 'AI_PROCESS_COMPLETED', 'AI_PROCESS_FAILED']);
        setTotalAIRunCount(aiRuns || 0);

        const { count: finalized } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .eq('action_type', 'FINAL_SCORE_SUBMITTED');
        setTotalFinalizedCount(finalized || 0);

        const { count: resets } = await supabase.from('audit_log').select('*', { count: 'exact', head: true })
          .eq('action_type', 'SYSTEM_RESET');
        setTotalResetCount(resets || 0);
      }
    } catch (err) {
      console.error('Error fetching audit statistics:', err);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('id-ID', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Badge Status Categorization — setiap action memiliki warna berbeda
  const getActionTheme = (action: string) => {
    const act = (action || '').toUpperCase();
    
    // LOGIN — Indigo (Admin)
    if (act === 'ADMIN_LOGIN') {
      return {
        badge: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20 dark:text-indigo-300 dark:bg-indigo-400/10 dark:border-indigo-400/20',
        text: 'login'
      };
    }
    
    // LOGIN — Blue (Dosen)
    if (act === 'LECTURER_LOGIN') {
      return {
        badge: 'text-blue-500 bg-blue-500/10 border-blue-500/20 dark:text-blue-400 dark:bg-blue-400/10 dark:border-blue-400/20',
        text: 'login'
      };
    }
    
    // LOGIN — Teal (Mahasiswa)
    if (act === 'STUDENT_LOGIN') {
      return {
        badge: 'text-teal-500 bg-teal-500/10 border-teal-500/20 dark:text-teal-400 dark:bg-teal-400/10 dark:border-teal-400/20',
        text: 'login'
      };
    }
    
    // AI RUN — Purple
    if (act === 'RUN_AI' || act === 'AI_PROCESS_STARTED') {
      return {
        badge: 'text-violet-500 bg-violet-500/10 border-violet-500/20 dark:text-violet-400 dark:bg-violet-400/10 dark:border-violet-400/20',
        text: 'ai'
      };
    }
    
    // AI COMPLETED — Emerald
    if (act === 'AI_PROCESS_COMPLETED') {
      return {
        badge: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-400/10 dark:border-emerald-400/20',
        text: 'success'
      };
    }
    
    // AI FAILED — Rose
    if (act === 'AI_PROCESS_FAILED') {
      return {
        badge: 'text-rose-500 bg-rose-500/10 border-rose-500/20 dark:text-rose-400 dark:bg-rose-400/10 dark:border-rose-400/20',
        text: 'danger'
      };
    }
    
    // SYSTEM RESET — Red
    if (act === 'SYSTEM_RESET') {
      return {
        badge: 'text-red-500 bg-red-500/10 border-red-500/20 dark:text-red-400 dark:bg-red-400/10 dark:border-red-400/20',
        text: 'danger'
      };
    }
    
    // FINALISASI / FINAL SCORE — Emerald (aligned with success color token)
    if (act === 'FINAL_SCORE_SUBMITTED') {
      return {
        badge: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-400/10 dark:border-emerald-400/20',
        text: 'success'
      };
    }
    
    // SUBMISSION — Sky
    if (act === 'SUBMISSION_SUBMITTED' || act === 'ANSWER_UPLOADED') {
      return {
        badge: 'text-sky-500 bg-sky-500/10 border-sky-500/20 dark:text-sky-400 dark:bg-sky-400/10 dark:border-sky-400/20',
        text: 'info'
      };
    }
    
    // REUPLOAD / REPLACE — Amber
    if (act === 'REUPLOAD_REQUESTED' || act === 'ANSWER_REPLACED') {
      return {
        badge: 'text-amber-500 bg-amber-500/10 border-amber-500/20 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/20',
        text: 'warning'
      };
    }
    
    // REVIEW — Lime
    if (act === 'REVIEW_DRAFT_SAVED') {
      return {
        badge: 'text-lime-500 bg-lime-500/10 border-lime-500/20 dark:text-lime-400 dark:bg-lime-400/10 dark:border-lime-400/20',
        text: 'review'
      };
    }
    
    // DELETE — Pink
    if (act === 'ANSWER_DELETED') {
      return {
        badge: 'text-pink-500 bg-pink-500/10 border-pink-500/20 dark:text-pink-400 dark:bg-pink-400/10 dark:border-pink-400/20',
        text: 'danger'
      };
    }
    
    // MODEL CHANGED / SETTINGS — Orange
    if (act === 'MODEL_CHANGED' || act === 'AI_MODEL_SELECTED' || act === 'SYSTEM_SETTING_CHANGED') {
      return {
        badge: 'text-orange-500 bg-orange-500/10 border-orange-500/20 dark:text-orange-400 dark:bg-orange-400/10 dark:border-orange-400/20',
        text: 'config'
      };
    }
    
    // AUDIT TEST — Fuchsia
    if (act === 'AUDIT_TEST') {
      return {
        badge: 'text-fuchsia-500 bg-fuchsia-500/10 border-fuchsia-500/20 dark:text-fuchsia-400 dark:bg-fuchsia-400/10 dark:border-fuchsia-400/20',
        text: 'test'
      };
    }
    
    // TEST_LOG_LEGACY — Slate
    if (act === 'TEST_LOG_LEGACY') {
      return {
        badge: 'text-slate-500 bg-slate-500/10 border-slate-500/20 dark:text-slate-400 dark:bg-slate-400/10 dark:border-slate-400/20',
        text: 'legacy'
      };
    }
    
    // DEFAULT — Cyan (untuk action baru yang belum dikategorikan)
    return {
      badge: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20 dark:text-cyan-400 dark:bg-cyan-400/10 dark:border-cyan-400/20',
      text: 'info'
    };
  };

  // Helper to safely normalise raw audit log structures (for old vs new table columns)
  const normalizeEntry = (log: AuditEntry) => {
    const rawAction = log.action || log.action_type || 'UNKNOWN';
    const action = standardizeModelName(rawAction);
    const target = standardizeModelName(log.target || log.target_type || 'system');
    const role = log.role || log.actor_role || 'system';
    const userName = log.user_name || log.admin_name || 'System';
    
    let detailObject: any = null;
    
    // JSON safety parsing: try-catch wrapper (Rule 6 hardening)
    if (log.detail !== undefined && log.detail !== null) {
      if (typeof log.detail === 'string') {
        try {
          detailObject = JSON.parse(standardizeModelName(log.detail));
        } catch {
          detailObject = standardizeModelName(log.detail);
        }
      } else {
        detailObject = log.detail;
      }
    } else if (log.description) {
      try {
        detailObject = JSON.parse(standardizeModelName(log.description));
      } catch {
        detailObject = standardizeModelName(log.description);
      }
    }
    
    return {
      id: log.id,
      created_at: log.created_at,
      userName,
      role,
      action,
      target,
      detail: detailObject
    };
  };

  // Standardize logs for display
  const normalizedLogs = useMemo(() => {
    return logs.map(normalizeEntry);
  }, [logs]);

  // Unique actions list for dropdown filtering from DB metadata helper
  const uniqueActions = [
    'ADMIN_LOGIN', 'LECTURER_LOGIN', 'STUDENT_LOGIN', 'ANSWER_UPLOADED', 
    'ANSWER_REPLACED', 'ANSWER_DELETED', 'SUBMISSION_SUBMITTED', 
    'AI_PROCESS_STARTED', 'AI_PROCESS_COMPLETED', 'AI_PROCESS_FAILED', 
    'REUPLOAD_REQUESTED', 'REVIEW_DRAFT_SAVED', 'FINAL_SCORE_SUBMITTED', 
    'MODEL_CHANGED', 'SYSTEM_RESET', 'AI_MODEL_SELECTED', 'SYSTEM_SETTING_CHANGED'
  ];

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (isChecking) {
    return <PageLoader message="Memverifikasi admin..." />;
  }

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <FileText className="w-6 h-6 text-cyan-500 dark:text-cyan-400 animate-pulse" />
            Enterprise Audit Log
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">
            Observability, audit trail, dan bukti rekam jejak aktivitas sistem E-MATHTOCO.
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/audit-debug')}
          className="px-4 py-2.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:border-neutral-800 rounded-xl transition-all cursor-pointer flex items-center gap-2 self-start sm:self-auto"
        >
          <Activity className="w-4 h-4 text-cyan-500 animate-pulse" />
          Debug Skema
        </button>
      </div>

      {!hasAuditTable ? (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center">
          <ShieldAlert className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-2">Tabel Audit Log Belum Tersedia</h3>
          <p className="text-xs text-slate-550 dark:text-neutral-400 max-w-md mx-auto">
            Gunakan file migrasi SQL <code className="bg-slate-100 dark:bg-neutral-900/60 px-1.5 py-0.5 rounded text-cyan-600 dark:text-cyan-400">migration_audit_log.sql</code> di Supabase SQL Editor untuk memperbarui skema tabel.
          </p>
        </div>
      ) : (
        <>
          {/* Sidang / Demo Mode Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white dark:bg-[#0A0A0F]/60 border border-slate-200 dark:border-neutral-900/80 rounded-2xl p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-550 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                <Database className="w-3 h-3 text-cyan-500" /> Total Logs
              </span>
              <span className="text-2xl font-extrabold text-slate-855 dark:text-white font-mono mt-2">{totalLogsCount}</span>
            </div>
            
            <div className="bg-white dark:bg-[#0A0A0F]/60 border border-slate-200 dark:border-neutral-900/80 rounded-2xl p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-550 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                <UserCheck className="w-3 h-3 text-emerald-500" /> Total Login
              </span>
              <span className="text-2xl font-extrabold text-slate-855 dark:text-white font-mono mt-2">{totalLoginCount}</span>
            </div>

            <div className="bg-white dark:bg-[#0A0A0F]/60 border border-slate-200 dark:border-neutral-900/80 rounded-2xl p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-550 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                <Cpu className="w-3 h-3 text-purple-500" /> Total AI Run
              </span>
              <span className="text-2xl font-extrabold text-slate-855 dark:text-white font-mono mt-2">{totalAIRunCount}</span>
            </div>

            <div className="bg-white dark:bg-[#0A0A0F]/60 border border-slate-200 dark:border-neutral-900/80 rounded-2xl p-4 shadow-lg backdrop-blur-md flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-550 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                <Award className="w-3 h-3 text-amber-500" /> Total Finalisasi
              </span>
              <span className="text-2xl font-extrabold text-slate-855 dark:text-white font-mono mt-2">{totalFinalizedCount}</span>
            </div>

            <div className="bg-white dark:bg-[#0A0A0F]/60 border border-slate-200 dark:border-neutral-900/80 rounded-2xl p-4 col-span-2 md:col-span-1 shadow-lg backdrop-blur-md flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-550 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                <RefreshCcw className="w-3 h-3 text-rose-500" /> Total Reset
              </span>
              <span className="text-2xl font-extrabold text-slate-855 dark:text-white font-mono mt-2">{totalResetCount}</span>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 backdrop-blur-md flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-3 w-4 h-4 text-slate-400 dark:text-neutral-600" />
              <input 
                type="text" 
                placeholder="Cari nama pengguna, role, action, target, detail, model AI..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-2.5 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600" 
              />
            </div>
            <select 
              value={actionFilter} 
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-900 rounded-xl py-2.5 px-4 text-sm text-slate-700 dark:text-neutral-350 focus:outline-none cursor-pointer"
            >
              <option value="all">Semua Action</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Table View */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" />
            </div>
          ) : (
            <ResponsiveTableWrapper className="bg-white dark:bg-[#0A0A0F]/80 shadow-xl">
              <GlassTable className="min-w-[850px]">
                <GlassTableHeader>
                  <tr>
                    <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 w-[20%] whitespace-nowrap">Waktu</th>
                    <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 w-[20%] whitespace-nowrap">Pengguna</th>
                    <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 w-[25%] whitespace-nowrap">Action</th>
                    <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 w-[25%] whitespace-nowrap">Target</th>
                    <th className="py-3.5 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-center w-[10%] whitespace-nowrap">Detail</th>
                  </tr>
                </GlassTableHeader>
                <tbody>
                  {normalizedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 dark:text-neutral-500 text-sm">
                        <EmptyState title="Belum ada aktivitas" description="Belum ada aktivitas sistem yang tercatat." />
                      </td>
                    </tr>
                  ) : normalizedLogs.map(log => {
                    const theme = getActionTheme(log.action);
                    return (
                      <GlassTableRow 
                        key={log.id} 
                        onClick={() => setSelectedLog(logs.find(x => x.id === log.id) || null)}
                      >
                        <td className="py-3.5 px-5 text-xs text-slate-500 dark:text-neutral-400 whitespace-nowrap font-mono">
                          {formatDate(log.created_at)}
                        </td>
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-800 dark:text-white">{log.userName}</span>
                            <span className="text-[10px] font-mono text-slate-400 dark:text-neutral-500 uppercase tracking-wider mt-0.5">{log.role}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-md border text-[9px] font-extrabold uppercase tracking-wider ${theme.badge}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-xs font-mono text-slate-650 dark:text-neutral-350 whitespace-nowrap">
                          {log.target}
                        </td>
                        <td className="py-3.5 px-5 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(logs.find(x => x.id === log.id) || null);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 text-slate-500 dark:text-neutral-400 transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Lihat Detail Log"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </GlassTableRow>
                    );
                  })}
                </tbody>
              </GlassTable>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-slate-200 dark:border-neutral-900 px-5 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-450 dark:text-neutral-500">
                    {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} dari {totalCount} log
                  </span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                      disabled={currentPage === 1} 
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-slate-600 dark:text-neutral-300">{currentPage}/{totalPages}</span>
                    <button 
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                      disabled={currentPage === totalPages} 
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </ResponsiveTableWrapper>
          )}
        </>
      )}

      {/* Log Detail Modal */}
      <AnimatePresence>
        {selectedLog && (() => {
          const norm = normalizeEntry(selectedLog);
          const theme = getActionTheme(norm.action);
          
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                variants={fadeIn}
                initial="initial"
                animate="animate"
                exit="exit"
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={() => setSelectedLog(null)}
              />
              
              {/* Modal Body */}
              <motion.div
                variants={modalTransition}
                initial="initial"
                animate="animate"
                exit="exit"
                className="relative w-full max-w-2xl bg-white dark:bg-[#09090F] border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 shadow-2xl overflow-hidden z-10"
              >
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-neutral-900/80 pb-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-cyan-500" />
                  <h3 className="text-md font-bold text-slate-900 dark:text-white">Detail Histori Aktivitas</h3>
                </div>
                <button 
                  onClick={() => setSelectedLog(null)} 
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Waktu */}
                  <div className="bg-slate-50/50 dark:bg-black/30 border border-slate-100 dark:border-neutral-900/40 rounded-xl p-3 flex items-start gap-2.5">
                    <Calendar className="w-4 h-4 text-slate-400 dark:text-neutral-500 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-slate-450 dark:text-neutral-500 uppercase tracking-widest font-bold">Waktu Kejadian</span>
                      <p className="text-xs text-slate-800 dark:text-white font-mono mt-0.5">{formatDate(norm.created_at)}</p>
                    </div>
                  </div>

                  {/* Pengguna */}
                  <div className="bg-slate-50/50 dark:bg-black/30 border border-slate-100 dark:border-neutral-900/40 rounded-xl p-3 flex items-start gap-2.5">
                    <User className="w-4 h-4 text-slate-400 dark:text-neutral-500 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-slate-450 dark:text-neutral-500 uppercase tracking-widest font-bold">Aktor Aksi</span>
                      <p className="text-xs text-slate-800 dark:text-white font-semibold mt-0.5">{norm.userName}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-mono tracking-wider">{norm.role}</p>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="bg-slate-50/50 dark:bg-black/30 border border-slate-100 dark:border-neutral-900/40 rounded-xl p-3 flex items-start gap-2.5">
                    <Tag className="w-4 h-4 text-slate-400 dark:text-neutral-500 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-slate-450 dark:text-neutral-500 uppercase tracking-widest font-bold">Nama Aksi</span>
                      <div className="mt-1">
                        <span className={`inline-block px-2 py-0.5 rounded-md border text-[9px] font-extrabold uppercase tracking-wider ${theme.badge}`}>
                          {norm.action}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Target */}
                  <div className="bg-slate-50/50 dark:bg-black/30 border border-slate-100 dark:border-neutral-900/40 rounded-xl p-3 flex items-start gap-2.5">
                    <BookOpen className="w-4 h-4 text-slate-400 dark:text-neutral-500 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-slate-450 dark:text-neutral-500 uppercase tracking-widest font-bold">Objek Sasaran</span>
                      <p className="text-xs text-slate-800 dark:text-white font-mono mt-0.5">{norm.target}</p>
                    </div>
                  </div>
                </div>

                {/* Detail JSON (hardened JSON parsing) */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 dark:text-neutral-500 uppercase tracking-widest font-bold">Metadata / Detail Perubahan (JSON)</span>
                  <div className="relative bg-slate-50 dark:bg-black/70 border border-slate-200 dark:border-neutral-900 rounded-xl p-4 max-h-[250px] overflow-y-auto font-mono text-xs">
                    <pre className="text-slate-800 dark:text-neutral-350 leading-relaxed whitespace-pre-wrap">
                      {typeof norm.detail === 'object' && norm.detail !== null
                        ? JSON.stringify(norm.detail, null, 2)
                        : String(norm.detail || '-')}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 dark:border-neutral-800 dark:hover:bg-neutral-900 dark:text-neutral-300 font-semibold text-xs cursor-pointer transition-all"
                >
                  Tutup Rincian
                </button>
              </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
    </PageTransition>
  );
}
