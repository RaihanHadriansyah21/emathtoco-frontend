'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';

interface AuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_table: string;
  target_id: string | null;
  details: string | null;
  created_at: string;
  admin_name?: string;
}

const ITEMS_PER_PAGE = 20;

export default function AuditLogPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasAuditTable, setHasAuditTable] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        const { data: profile } = await supabase.from('profil_pengguna').select('role').eq('id', user.id).maybeSingle();
        if (normalizeRole(profile?.role) !== 'admin') { router.push('/'); return; }
        setIsChecking(false);
        fetchLogs();
      } catch { router.push('/'); }
    };
    checkAdmin();
  }, [router]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Table might not exist yet
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setHasAuditTable(false);
        }
        console.error('Error fetching audit logs:', error);
        setLogs([]);
        return;
      }

      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getActionColor = (action: string) => {
    if (action.startsWith('DELETE') || action.startsWith('RESET')) return 'text-red-500 dark:text-red-400 bg-red-500/10 border-red-500/20';
    if (action.startsWith('CREATE') || action.startsWith('INSERT')) return 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (action.startsWith('UPDATE')) return 'text-amber-500 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-slate-500 dark:text-neutral-400 bg-slate-500/10 border-slate-500/20';
  };

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const filtered = logs.filter(l => {
    const matchesSearch = l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.target_table?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.details?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'all' || l.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (isChecking) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <FileText className="w-6 h-6 text-amber-500 dark:text-amber-400" />
          Audit Log
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Riwayat aktivitas administratif sistem EMATHTOCO.</p>
      </div>

      {!hasAuditTable ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center">
          <FileText className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-2">Tabel Audit Log Belum Tersedia</h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400 max-w-md mx-auto">
            Jalankan migrasi SQL <code className="bg-slate-100 dark:bg-neutral-900 px-1.5 py-0.5 rounded text-cyan-600 dark:text-cyan-400">admin_rls_policies.sql</code> di Supabase SQL Editor untuk membuat tabel audit_log.
          </p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 backdrop-blur-md flex flex-col sm:flex-row gap-3">
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-3 w-4 h-4 text-slate-400 dark:text-neutral-600" />
              <input type="text" placeholder="Cari action, tabel, atau detail..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-2.5 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600" />
            </div>
            {uniqueActions.length > 0 && (
              <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
                className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-900 rounded-xl py-2.5 px-4 text-sm text-slate-700 dark:text-neutral-300 focus:outline-none cursor-pointer">
                <option value="all">Semua Action</option>
                {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>
          ) : (
            <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-neutral-900 bg-slate-50 dark:bg-black/40">
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Waktu</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Action</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Target</th>
                      <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-900/50">
                    {paginated.length === 0 ? (
                      <tr><td colSpan={4} className="py-12 text-center text-slate-400 dark:text-neutral-500 text-sm">Belum ada log.</td></tr>
                    ) : paginated.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors">
                        <td className="py-3 px-5 text-xs text-slate-400 dark:text-neutral-500 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="py-3 px-5">
                          <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${getActionColor(log.action)}`}>{log.action}</span>
                        </td>
                        <td className="py-3 px-5 text-xs font-mono text-slate-600 dark:text-neutral-300">{log.target_table}{log.target_id ? ` #${log.target_id.substring(0, 8)}` : ''}</td>
                        <td className="py-3 px-5 text-xs text-slate-500 dark:text-neutral-400 max-w-[300px] truncate">{log.details || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="border-t border-slate-200 dark:border-neutral-900 px-5 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-neutral-500">{(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} dari {filtered.length}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="text-xs font-bold text-slate-600 dark:text-neutral-300">{currentPage}/{totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 disabled:opacity-30 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
