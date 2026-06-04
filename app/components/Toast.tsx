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
  iconColor: string;
  glow: string;
}> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-emerald-500/25',
    bg: 'bg-emerald-950/40',
    titleColor: 'text-emerald-300',
    iconColor: 'text-emerald-400',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.08)]',
  },
  error: {
    icon: <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-red-500/25',
    bg: 'bg-red-950/40',
    titleColor: 'text-red-300',
    iconColor: 'text-red-400',
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.08)]',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-amber-500/25',
    bg: 'bg-amber-950/40',
    titleColor: 'text-amber-300',
    iconColor: 'text-amber-400',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.08)]',
  },
  info: {
    icon: <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />,
    border: 'border-cyan-500/25',
    bg: 'bg-cyan-950/40',
    titleColor: 'text-cyan-300',
    iconColor: 'text-cyan-400',
    glow: 'shadow-[0_0_20px_rgba(6,182,212,0.08)]',
  },
};

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
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
                <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{t.message}</p>
              )}
            </div>
            <button
              onClick={() => onRemove(t.id)}
              className="flex-shrink-0 text-neutral-600 hover:text-neutral-300 transition-colors mt-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
