'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ModalPortal from '@/components/ui/ModalPortal';
import { fadeIn, modalTransition } from '@/styles/motion';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  isLoading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'default',
  isLoading = false,
}: ConfirmModalProps) {
  const isDanger = variant === 'danger';

  return (
    <ModalPortal active={isOpen}>
      <AnimatePresence>
        {isOpen && (
          <div
            className="fixed inset-0 z-[130] flex min-h-[100dvh] items-center justify-center overflow-y-auto overscroll-contain p-4"
            data-testid="confirm-modal-layer"
          >
          {/* Backdrop */}
          <motion.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal Card */}
            <motion.div
              variants={modalTransition}
              initial="initial"
              animate="animate"
              exit="exit"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-modal-title"
              aria-describedby="confirm-modal-message"
              className="relative z-10 my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-[#0D0D14]/90 dark:backdrop-blur-md dark:shadow-[0_0_60px_rgba(0,0,0,0.9)]"
            >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
              isDanger
                ? 'bg-red-500/10 border border-red-500/20'
                : 'bg-cyan-500/10 border border-cyan-500/20'
            }`}>
              <AlertTriangle className={`w-6 h-6 ${isDanger ? 'text-red-400' : 'text-cyan-400'}`} />
            </div>

            {/* Content */}
            <h3 id="confirm-modal-title" className="text-lg font-bold text-slate-900 dark:text-white mb-2">{title}</h3>
            <p id="confirm-modal-message" className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed mb-6">{message}</p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-800 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] ${
                  isDanger
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                    : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-450 hover:via-blue-550 hover:to-indigo-650 text-white shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                }`}
              >
                {isLoading ? 'Memproses...' : confirmLabel}
              </button>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
