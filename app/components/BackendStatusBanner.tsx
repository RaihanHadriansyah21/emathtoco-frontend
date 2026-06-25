'use client';

import React, { useState } from 'react';
import { WifiOff, RefreshCw, X, CheckCircle } from 'lucide-react';
import { useBackendStatus } from '@/lib/backend-store';

// ============================================================
// EMATHTOCO — Backend Status Banner
//
// Menampilkan banner peringatan di atas halaman jika backend
// FastAPI sedang offline. Hanya muncul saat backendState='offline'.
//
// Fitur:
// - Pesan: "Backend AI sedang offline. Fitur prediksi sementara tidak tersedia."
// - Tombol "Coba Lagi" → retryBackendCheck()
// - Tombol dismiss (X) → sembunyikan banner
// - Smooth animation
// ============================================================

export default function BackendStatusBanner() {
  const { backendState, retryBackendCheck } = useBackendStatus();
  const [dismissed, setDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [justCameOnline, setJustCameOnline] = useState(false);

  // Reset dismissed state when backend comes back online then goes offline again
  React.useEffect(() => {
    if (backendState === 'online') {
      setDismissed(false);
    }
  }, [backendState]);

  // Show success briefly when backend comes back online
  React.useEffect(() => {
    if (backendState === 'online' && isRetrying) {
      setJustCameOnline(true);
      setIsRetrying(false);
      const timer = setTimeout(() => setJustCameOnline(false), 3000);
      return () => clearTimeout(timer);
    }
    if (backendState === 'offline') {
      setIsRetrying(false);
    }
  }, [backendState, isRetrying]);

  const handleRetry = async () => {
    setIsRetrying(true);
    await retryBackendCheck();
  };

  // Show success banner briefly
  if (justCameOnline) {
    return (
      <div className="w-full bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300">
        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span className="text-xs sm:text-sm font-medium text-emerald-400">
          Backend AI kembali online. Semua fitur tersedia.
        </span>
      </div>
    );
  }

  // Don't show if online, checking, or dismissed
  if (backendState !== 'offline' || dismissed) {
    return null;
  }

  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-300 relative z-40">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="text-xs sm:text-sm font-medium text-amber-400 truncate">
          Backend AI sedang offline. Fitur prediksi sementara tidak tersedia.
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isRetrying ? 'Mengecek...' : 'Coba Lagi'}</span>
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
          title="Tutup"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
