'use client';

import { logger } from '@/lib/logger';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle, Loader2, LogIn, QrCode } from 'lucide-react';

import PageTransition from '@/components/ui/PageTransition';
import { useAuth } from '@/app/components/AuthGate';
import { supabase } from '@/lib/supabase';
import { sha256Hex } from '@/lib/join-token';

interface JoinResult {
  success: boolean;
  course_id?: string;
  enrollment_id?: string;
}

function JoinClassContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const token = searchParams.get('token') ?? '';

  const [status, setStatus] = useState<'idle' | 'joining' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('Memeriksa QR join kelas...');
  const [courseId, setCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token QR tidak ditemukan. Scan ulang QR dari dosen.');
      return;
    }

    if (!user) {
      setStatus('idle');
      setMessage('Silakan login sebagai mahasiswa, lalu buka ulang link QR ini.');
      return;
    }

    if (user.role !== 'mahasiswa') {
      setStatus('error');
      setMessage('QR join kelas hanya bisa digunakan oleh akun mahasiswa.');
      return;
    }

    const joinClass = async () => {
      setStatus('joining');
      setMessage('Menghubungkan akun Anda ke kelas...');

      try {
        const tokenHash = await sha256Hex(token);
        const { data, error } = await supabase.rpc('join_class_with_token', {
          p_token_hash: tokenHash,
        });

        if (error) throw error;

        const result = data as JoinResult;
        setCourseId(result.course_id ?? null);
        setStatus('success');
        setMessage('Anda berhasil masuk ke kelas.');
      } catch (err) {
        logger.error('Failed to join class with token:', err);
        setStatus('error');
        setMessage('QR sudah kadaluarsa, dicabut, limit scan habis, atau database belum dimigrasikan.');
      }
    };

    joinClass();
  }, [token, user]);

  const icon = status === 'success'
    ? <CheckCircle className="w-12 h-12 text-emerald-400" />
    : status === 'error'
      ? <AlertTriangle className="w-12 h-12 text-amber-400" />
      : status === 'joining'
        ? <Loader2 className="w-12 h-12 text-cyan-400 animate-spin" />
        : <QrCode className="w-12 h-12 text-cyan-400" />;

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-800 dark:text-neutral-200 font-sans flex items-center justify-center px-4 py-10 relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/7 rounded-full blur-[120px]" />
          <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/7 rounded-full blur-[130px]" />
        </div>

        <div className="relative z-10 w-full max-w-md bg-white/95 border border-slate-200 dark:bg-[#0A0A0F]/90 dark:border-neutral-900 rounded-3xl p-7 shadow-2xl text-center space-y-5">
          <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto">
            {icon}
          </div>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-400 mb-2">QR Join Kelas</p>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Masuk Kelas</h1>
            <p className="text-sm text-slate-500 dark:text-neutral-400 mt-2 leading-relaxed">{message}</p>
          </div>

          {!user && (
            <button
              type="button"
              onClick={() => router.push('/login/mahasiswa')}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              LOGIN MAHASISWA
            </button>
          )}

          {status === 'success' && (
            <button
              type="button"
              onClick={() => router.push(courseId ? `/matkul/${courseId}` : '/')}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer"
            >
              BUKA MATA KULIAH
            </button>
          )}

          {status === 'error' && (
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full bg-slate-100 border border-slate-200 hover:bg-slate-200 dark:bg-neutral-950 dark:border-neutral-900 dark:hover:bg-neutral-900 text-slate-700 dark:text-neutral-300 px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer"
            >
              KEMBALI
            </button>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

export default function JoinClassPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    }>
      <JoinClassContent />
    </Suspense>
  );
}
