'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Loader2, Globe, Database, Palette, Server, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { apiGet, apiPost } from '@/lib/api-client';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';
import { useAuth } from '@/app/components/AuthGate';

export default function SystemSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // Toggles for Observability Settings
  const [verboseLogging, setVerboseLogging] = useState(false);
  const [autoRunAi, setAutoRunAi] = useState(false);

  // Admin details for audit logging
  const [adminName, setAdminName] = useState('Administrator');
  const [adminRole, setAdminRole] = useState('admin');
  const [adminId, setAdminId] = useState<string | null>(null);

  const loadSettingsFromDB = async () => {
    try {
      const res = await apiGet('/settings');
      if (res.ok) {
        const settings = await res.json();
        setVerboseLogging(settings.verbose_logging === 'true');
        setAutoRunAi(settings.auto_run_ai === 'true');
      }
    } catch (err) {
      console.error('Failed to load settings from database:', err);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSettingChange = async (
    settingName: string,
    oldVal: boolean,
    newVal: boolean,
    setter: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    // Optimistic Update
    setter(newVal);
    
    const keyName = settingName === 'Verbose Logging' ? 'verbose_logging' : 'auto_run_ai';
    
    try {
      const payload = {
        changed_by: adminName,
        role: adminRole,
        user_id: adminId,
        settings: {
          [keyName]: String(newVal)
        }
      };
      
      const res = await apiPost('/settings', payload);
      if (!res.ok) {
        throw new Error('API update failed');
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
      // Rollback
      setter(oldVal);
    }
  };

  useEffect(() => {
    if (user) {
      setAdminId(user.id);
      setAdminName(user.nama_lengkap);
      setAdminRole(normalizeRole(user.role));
      checkDbConnection();
      loadSettingsFromDB();
    }
  }, [user]);

  const checkDbConnection = async () => {
    try {
      const { error } = await supabase.from('profil_pengguna').select('id', { count: 'exact', head: true });
      setDbConnected(!error);
    } catch {
      setDbConnected(false);
    }
  };

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'dark';

  const infoItems = [
    { label: 'Nama Aplikasi', value: 'E-MATHTOCO', icon: Globe, iconColor: 'text-cyan-500 dark:text-cyan-400' },
    { label: 'Versi', value: '0.1.0', icon: Server, iconColor: 'text-indigo-500 dark:text-indigo-400' },
    { label: 'Framework', value: 'Next.js 16.2.6 + React 19', icon: Server, iconColor: 'text-purple-500 dark:text-purple-400' },
    { label: 'Database', value: 'Supabase (PostgreSQL)', icon: Database, iconColor: 'text-emerald-500 dark:text-emerald-400' },
    { label: 'Tema Aktif', value: currentTheme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode', icon: Palette, iconColor: 'text-amber-500 dark:text-amber-400' },
  ];

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Settings className="w-6 h-6 text-slate-500 dark:text-neutral-400" />
          System Settings
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Informasi sistem dan konfigurasi aplikasi E-MATHTOCO.</p>
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

      {/* Setelan Observabilitas */}
      <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md p-6 space-y-4">
        <div>
          <h2 className="text-xs font-bold text-slate-550 dark:text-neutral-405 uppercase tracking-widest">Setelan Aplikasi (Observabilitas)</h2>
          <p className="text-[10px] text-slate-450 dark:text-neutral-500 mt-1">Sesuaikan perilaku observability dan otomasi sistem di bawah ini.</p>
        </div>
        
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-neutral-900/40 pt-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-white">Verbose Logging</h3>
            <p className="text-[10px] text-slate-500 dark:text-neutral-500">Mencatat detail payload log audit secara lebih rinci.</p>
          </div>
          <button
            onClick={() => handleSettingChange('Verbose Logging', verboseLogging, !verboseLogging, setVerboseLogging)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
              verboseLogging ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-neutral-800'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
              verboseLogging ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 dark:border-neutral-900/40 pt-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-white">Auto-Run AI on Submission</h3>
            <p className="text-[10px] text-slate-500 dark:text-neutral-500">Menjalankan pipeline kecerdasan buatan secara otomatis saat berkas dikirim.</p>
          </div>
          <button
            onClick={() => handleSettingChange('Auto-Run AI on Submission', autoRunAi, !autoRunAi, setAutoRunAi)}
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
              autoRunAi ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-neutral-800'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${
              autoRunAi ? 'left-6' : 'left-1'
            }`} />
          </button>
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
    </PageTransition>
  );
}
