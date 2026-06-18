'use client';

import React from 'react';
import { Inbox } from 'lucide-react';
import { motion, Variants } from 'framer-motion';

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 5 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.22,
      ease: [0.16, 1, 0.3, 1]
    } 
  }
};

interface ResponsiveTableWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveTableWrapper({ children, className = '' }: ResponsiveTableWrapperProps) {
  return (
    <div className={`w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200 dark:border-neutral-900 bg-white/50 dark:bg-black/10 backdrop-blur-md ${className}`}>
      {children}
    </div>
  );
}

interface GlassTableProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassTable({ children, className = '' }: GlassTableProps) {
  return (
    <table className={`w-full border-collapse text-left ${className}`}>
      {children}
    </table>
  );
}

interface GlassTableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassTableHeader({ children, className = '' }: GlassTableHeaderProps) {
  return (
    <thead className={`sticky top-0 z-10 border-b border-slate-200 dark:border-neutral-850 bg-slate-50/80 dark:bg-[#0A0A0F]/90 backdrop-blur-sm ${className}`}>
      {children}
    </thead>
  );
}

interface GlassTableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function GlassTableRow({ children, className = '', onClick, hoverable = true }: GlassTableRowProps) {
  return (
    <motion.tr 
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      onClick={onClick}
      className={`border-b border-slate-100 dark:border-neutral-900/50 transition-colors transition-shadow duration-150 ${
        onClick ? 'cursor-pointer' : ''
      } ${
        hoverable ? 'hover:bg-slate-50/60 dark:hover:bg-white/[0.025]' : ''
      } ${className}`}
    >
      {children}
    </motion.tr>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ 
  title = 'Tidak Ada Data', 
  description = 'Belum ada data yang tersedia untuk ditampilkan.', 
  icon,
  className = ''
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 ${className}`}>
      <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-900 flex items-center justify-center text-slate-400 dark:text-neutral-500 mb-4">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-sm font-bold text-slate-800 dark:text-neutral-200 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-neutral-450 max-w-xs leading-relaxed">{description}</p>
    </div>
  );
}
