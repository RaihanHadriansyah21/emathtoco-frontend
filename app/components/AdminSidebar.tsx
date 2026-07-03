'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  UserCheck,
  Cpu,
  Activity,
  FileText,
  RotateCcw,
  Settings,
  ChevronLeft,
} from 'lucide-react';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onItemClick?: () => void;
  hideToggle?: boolean;
}

const sections = [
  {
    title: 'Menu Utama',
    items: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard, emoji: '📊' },
      { href: '/admin/users', label: 'Pengguna', icon: Users, emoji: '👥' },
      { href: '/admin/courses', label: 'Mata Kuliah', icon: BookOpen, emoji: '📚' },
      { href: '/admin/lecturers', label: 'Dosen Pengajar', icon: GraduationCap, emoji: '🎓' },
      { href: '/admin/enrollment', label: 'Enrollment', icon: UserCheck, emoji: '📋' },
    ]
  },
  {
    title: 'Sistem & AI',
    items: [
      { href: '/admin/ai-models', label: 'Model AI', icon: Cpu, emoji: '🤖' },
      { href: '/admin/monitoring', label: 'Monitoring', icon: Activity, emoji: '📈' },
      { href: '/admin/audit', label: 'Audit Log', icon: FileText, emoji: '📝' },
    ]
  },
  {
    title: 'Utilitas',
    items: [
      { href: '/admin/reset', label: 'Demo Reset', icon: RotateCcw, emoji: '🔄' },
      { href: '/admin/system-settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
    ]
  }
];

export default function AdminSidebar({ 
  collapsed, 
  onToggle, 
  onItemClick, 
  hideToggle = false 
}: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  };

  const sidebarWidth = hideToggle ? '100%' : (collapsed ? 80 : 270);

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarWidth }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={`h-full flex-shrink-0 flex flex-col ${
        hideToggle
          ? 'w-full border-none bg-transparent'
          : `hidden md:flex sticky top-16 h-[calc(100vh-4rem)] border-r border-slate-200 dark:border-neutral-900 bg-white/80 dark:bg-[#070710]/80 backdrop-blur-md z-30`
      }`}
    >
      {/* Nav items */}
      <nav className={`flex-1 py-4 px-3 space-y-4 ${
        collapsed && !hideToggle ? 'overflow-visible' : 'overflow-y-auto'
      }`}>
        {sections.map((section, secIdx) => (
          <div key={secIdx} className="space-y-1">
            {/* Section Title (smooth fade and height collapse) */}
            <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-neutral-600 transition-all duration-300 origin-left overflow-hidden ${
              collapsed && !hideToggle ? 'opacity-0 max-h-0 py-0 scale-95' : 'opacity-100 max-h-[30px] scale-100'
            }`}>
              {section.title}
            </div>

            {/* Section Divider Line (smooth fade and height collapse) */}
            {secIdx > 0 && (
              <div className={`bg-slate-200 dark:bg-neutral-900/60 mx-1 transition-all duration-300 ${
                collapsed && !hideToggle ? 'h-px my-2 opacity-100' : 'h-0 my-0 opacity-0 overflow-hidden'
              }`} />
            )}

            {section.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <button
                  key={item.href}
                  onClick={() => {
                    router.push(item.href);
                    if (onItemClick) onItemClick();
                  }}
                  className={`w-full flex items-center rounded-xl transition-all duration-300 cursor-pointer group relative ${
                    collapsed && !hideToggle ? 'justify-center px-2 py-3 gap-0' : 'px-3 py-2.5 gap-3'
                  } ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/10 via-blue-500/5 to-transparent border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 shadow-[inset_1px_0_0_rgba(6,182,212,0.15),0_0_15px_rgba(6,182,212,0.04)]'
                      : 'border border-transparent text-slate-500 dark:text-neutral-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-200 dark:hover:border-neutral-800'
                  }`}
                >
                  {/* Accent vertical line for active menu item */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3/5 bg-cyan-500 dark:bg-cyan-400 rounded-r shadow-[0_0_8px_rgba(34,211,238,0.7)]" />
                  )}

                  <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-transform group-hover:scale-105 ${
                    active ? 'text-cyan-500 dark:text-cyan-400' : 'text-slate-400 dark:text-neutral-600 group-hover:text-slate-600 dark:group-hover:text-neutral-300'
                  }`} />
                  
                  {/* Item Label (smooth width & opacity fade) */}
                  <span className={`text-sm font-semibold truncate transition-all duration-300 origin-left ${
                    active ? 'text-cyan-700 dark:text-cyan-300' : ''
                  } ${
                    collapsed && !hideToggle ? 'opacity-0 max-w-0 translate-x-[-10px] overflow-hidden' : 'opacity-100 max-w-[150px] translate-x-0'
                  }`}>
                    {item.label}
                  </span>

                  {/* Tooltip on Hover in Collapsed State */}
                  {collapsed && !hideToggle && (
                    <span className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg bg-slate-900/90 dark:bg-[#070710]/95 border border-slate-200/10 dark:border-neutral-800/80 text-white text-xs font-semibold whitespace-nowrap shadow-xl invisible group-hover:visible opacity-0 scale-95 translate-x-[-10px] group-hover:opacity-100 group-hover:scale-100 group-hover:translate-x-0 pointer-events-none transition-all duration-200 z-50 flex items-center gap-1.5">
                      <span>{item.emoji}</span>
                      <span>{item.label}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      {!hideToggle && (
        <div className="border-t border-slate-200 dark:border-neutral-900 px-3 py-2">
          <button
            onClick={onToggle}
            className={`w-full flex items-center rounded-xl text-slate-400 dark:text-neutral-600 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all duration-300 cursor-pointer ${
              collapsed ? 'justify-center py-3' : 'px-3 py-2.5'
            }`}
          >
            <ChevronLeft
              className={`w-4 h-4 flex-shrink-0 transition-transform duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
            <motion.span
              initial={false}
              animate={{
                width: collapsed ? 0 : 'auto',
                opacity: collapsed ? 0 : 1,
                marginLeft: collapsed ? 0 : 14,
              }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="text-xs font-semibold whitespace-nowrap overflow-hidden inline-block"
            >
              Tutup
            </motion.span>
          </button>
        </div>
      )}
    </motion.aside>
  );
}
