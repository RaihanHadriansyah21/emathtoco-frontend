'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Loader2, Globe, Database, Palette, Server, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { useTheme } from 'next-themes';

export default function SystemSettingsPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        const { data: profile } = await supabase.from('profil_pengguna').select('role').eq('id', user.id).maybeSingle();
        if (normalizeRole(profile?.role) !== 'admin') { router.push('/'); return; }
        setIsChecking(false);
        checkDbConnection();
      } catch { router.push('/'); }
    };
    checkAdmin();
  }, [router]);

  const checkDbConnection = async () => {
    try {
      const { error } = await supabase.from('profil_pengguna').select('id', { count: 'exact', head: true });
      setDbConnected(!error);
    } catch {
      setDbConnected(false);
    }
  };

  if (isChecking) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>;
  }

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'dark';

  const infoItems = [
    { label: 'Nama Aplikasi', value: 'EMATHTOCO', icon: Globe, iconColor: 'text-cyan-500 dark:text-cyan-400' },
    { label: 'Versi', value: '0.1.0', icon: Server, iconColor: 'text-indigo-500 dark:text-indigo-400' },
    { label: 'Framework', value: 'Next.js 16.2.6 + React 19', icon: Server, iconColor: 'text-purple-500 dark:text-purple-400' },
    { label: 'Database', value: 'Supabase (PostgreSQL)', icon: Database, iconColor: 'text-emerald-500 dark:text-emerald-400' },
    { label: 'Tema Aktif', value: currentTheme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode', icon: Palette, iconColor: 'text-amber-500 dark:text-amber-400' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Settings className="w-6 h-6 text-slate-500 dark:text-neutral-400" />
          System Settings
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Informasi sistem dan konfigurasi aplikasi EMATHTOCO.</p>
      </div>

      {/* Connection Status */}
      <div className={`rounded-2xl p-5 border flex items-center gap-4 ${
        dbConnected === null
          ? 'bg-slate-50 dark:bg-[#0A0A0F]/80 border-slate-200 dark:border-neutral-900'
          : dbConnected
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-red-500/5 border-red-500/20'
      }`}>
        {dbConnected === null ? (
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
        ) : dbConnected ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
        ) : (
          <XCircle className="w-6 h-6 text-red-500 dark:text-red-400" />
        )}
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">
            {dbConnected === null ? 'Memeriksa koneksi...' : dbConnected ? 'Database Terhubung' : 'Database Terputus'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {dbConnected === null ? 'Menghubungi server database...' : dbConnected ? 'Supabase PostgreSQL merespons dengan baik.' : 'Tidak dapat menghubungi database.'}
          </p>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-neutral-900 bg-slate-50 dark:bg-black/40">
          <h2 className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Informasi Sistem</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-neutral-900/50">
          {infoItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${item.iconColor}`} />
                  <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">{item.label}</span>
                </div>
                <span className="text-sm font-mono text-slate-800 dark:text-white">{item.value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Environment */}
      <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-neutral-900 bg-slate-50 dark:bg-black/40">
          <h2 className="text-xs font-bold text-slate-500 dark:text-neutral-400 uppercase tracking-widest">Environment</h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-neutral-900/50">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">Node Environment</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              {process.env.NODE_ENV || 'development'}
            </span>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">Supabase URL</span>
            <span className="text-xs font-mono text-slate-500 dark:text-neutral-400 truncate max-w-[300px]">
              {process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Configured' : '❌ Missing'}
            </span>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">Theme Storage Key</span>
            <span className="text-xs font-mono text-slate-500 dark:text-neutral-400">emathoco-theme</span>
          </div>
        </div>
      </div>
    </div>
  );
}
