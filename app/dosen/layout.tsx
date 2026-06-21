'use client';

import React from 'react';
import { useRequireRole } from '@/app/hooks/useRequireRole';
import { PageLoader } from '@/components/ui/loaders';

export default function DosenLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthorized } = useRequireRole('dosen');

  if (isLoading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
        <PageLoader message="Memverifikasi akses dosen..." />
      </div>
    );
  }

  return (
    <>
      {children}
    </>
  );
}
