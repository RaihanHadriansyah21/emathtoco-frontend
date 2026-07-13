'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export function PageLoader({ message = 'Memuat halaman...' }: { message?: string }) {
  return (
    <div className="w-full h-full min-h-[70vh] flex flex-col items-center justify-center font-sans p-6">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
        <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">{message}</p>
      </div>
    </div>
  );
}

export function CardLoader({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div 
          key={idx} 
          className="glass-card rounded-2xl p-5 sm:p-6 flex flex-col justify-between animate-pulse h-40 border border-slate-200 dark:border-neutral-900"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-neutral-900"></div>
            <div className="flex-1 space-y-2">
              <div className="h-3 w-16 bg-slate-200 dark:bg-neutral-900 rounded"></div>
              <div className="h-5 w-3/4 bg-slate-200 dark:bg-neutral-900 rounded"></div>
            </div>
          </div>
          <div className="h-8 bg-slate-200 dark:bg-neutral-900 rounded-xl mt-4 w-full"></div>
        </div>
      ))}
    </div>
  );
}

export function TableLoader({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-900 animate-pulse bg-white/50 dark:bg-black/10">
      <div className="h-12 border-b border-slate-200 dark:border-neutral-800 bg-slate-50/50 dark:bg-black/30 flex items-center px-6 gap-4">
        {Array.from({ length: cols }).map((_, idx) => (
          <div key={idx} className="h-4 bg-slate-200 dark:bg-neutral-900 rounded flex-1"></div>
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-neutral-900/50">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="h-14 flex items-center px-6 gap-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <div 
                key={colIdx} 
                className={`h-3 bg-slate-200 dark:bg-neutral-900 rounded ${
                  colIdx === 0 ? 'w-1/3' : 'flex-1'
                }`}
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
