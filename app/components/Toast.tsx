'use client';

import React from 'react';
import { X, CheckCircle2, AlertTriangle, Info, XCircle } from 'lucide-react';
import type { Toast, ToastType } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

const config: Record<ToastType, {
  icon: React.ReactNode;
  border: string;
  bg: string;
  titleColor: string;
  messageColor: string;
  iconColor: string;
  closeColor: string;
  glow: string;
}> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-emerald-300 dark:border-emerald-500/35',
    bg: 'bg-emerald-50/95 dark:bg-emerald-950/85',
    titleColor: 'text-emerald-800 dark:text-emerald-200',
    messageColor: 'text-emerald-900/80 dark:text-emerald-100/80',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
    closeColor: 'text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-200/70 dark:hover:text-white',
    glow: 'shadow-[0_12px_30px_rgba(16,185,129,0.18)] dark:shadow-[0_0_20px_rgba(16,185,129,0.12)]',
  },
  error: {
    icon: <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-red-300 dark:border-red-500/35',
    bg: 'bg-red-50/95 dark:bg-red-950/85',
    titleColor: 'text-red-800 dark:text-red-200',
    messageColor: 'text-red-900/80 dark:text-red-100/80',
    iconColor: 'text-red-600 dark:text-red-300',
    closeColor: 'text-red-700/70 hover:text-red-900 dark:text-red-200/70 dark:hover:text-white',
    glow: 'shadow-[0_12px_30px_rgba(239,68,68,0.16)] dark:shadow-[0_0_20px_rgba(239,68,68,0.12)]',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-amber-300 dark:border-amber-500/35',
    bg: 'bg-amber-50/95 dark:bg-amber-950/85',
    titleColor: 'text-amber-900 dark:text-amber-200',
    messageColor: 'text-amber-950/80 dark:text-amber-100/80',
    iconColor: 'text-amber-600 dark:text-amber-300',
    closeColor: 'text-amber-800/70 hover:text-amber-950 dark:text-amber-200/70 dark:hover:text-white',
    glow: 'shadow-[0_12px_30px_rgba(245,158,11,0.16)] dark:shadow-[0_0_20px_rgba(245,158,11,0.12)]',
  },
  info: {
    icon: <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-cyan-300 dark:border-cyan-500/35',
    bg: 'bg-cyan-50/95 dark:bg-cyan-950/85',
    titleColor: 'text-cyan-800 dark:text-cyan-200',
    messageColor: 'text-cyan-900/80 dark:text-cyan-100/80',
    iconColor: 'text-cyan-600 dark:text-cyan-300',
    closeColor: 'text-cyan-700/70 hover:text-cyan-900 dark:text-cyan-200/70 dark:hover:text-white',
    glow: 'shadow-[0_12px_30px_rgba(6,182,212,0.16)] dark:shadow-[0_0_20px_rgba(6,182,212,0.12)]',
  },
};

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 left-4 sm:left-auto z-[9999] flex flex-col gap-3 max-w-sm w-[calc(100%-2rem)] sm:w-80 pointer-events-none">
      {toasts.map((t) => {
        const c = config[t.type];
        return (
          <div
            key={t.id}
            className={`
              pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl
              border ${c.border} ${c.bg} ${c.glow}
              backdrop-blur-md
              animate-in slide-in-from-right-4 fade-in duration-300
            `}
          >
            <span className={c.iconColor}>{c.icon}</span>
            <div className="flex-grow min-w-0">
              <p className={`text-sm font-bold ${c.titleColor} leading-snug`}>{t.title}</p>
              {t.message && (
                <p className={`text-xs ${c.messageColor} mt-0.5 leading-relaxed`}>{t.message}</p>
              )}
            </div>
            <button
              onClick={() => onRemove(t.id)}
              className={`flex-shrink-0 ${c.closeColor} transition-colors mt-0.5 cursor-pointer`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
