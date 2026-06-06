'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  ChevronRight,
} from 'lucide-react';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onItemClick?: () => void;
  hideToggle?: boolean;
}

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Pengguna', icon: Users },
  { href: '/admin/courses', label: 'Mata Kuliah', icon: BookOpen },
  { href: '/admin/lecturers', label: 'Dosen Pengajar', icon: GraduationCap },
  { href: '/admin/enrollment', label: 'Enrollment', icon: UserCheck },
  { href: '/admin/ai-models', label: 'Model AI', icon: Cpu },
  { href: '/admin/monitoring', label: 'Monitoring', icon: Activity },
  { href: '/admin/audit', label: 'Audit Log', icon: FileText },
  { href: '/admin/reset', label: 'Demo Reset', icon: RotateCcw },
  { href: '/admin/system-settings', label: 'Settings', icon: Settings },
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

  return (
    <aside
      className={`h-full flex-shrink-0 flex flex-col transition-all duration-300 ${
        hideToggle
          ? 'w-full border-none bg-transparent'
          : `sticky top-16 h-[calc(100vh-4rem)] border-r border-slate-200 dark:border-neutral-900 bg-white/80 dark:bg-[#070710]/80 backdrop-blur-md z-30 ${
              collapsed ? 'w-[68px]' : 'w-[240px]'
            }`
      }`}
    >
      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              onClick={() => {
                router.push(item.href);
                if (onItemClick) onItemClick();
              }}
              title={collapsed && !hideToggle ? item.label : undefined}
              className={`w-full flex items-center gap-3 rounded-xl transition-all duration-200 cursor-pointer group ${
                collapsed && !hideToggle ? 'justify-center px-2 py-3' : 'px-3 py-2.5'
              } ${
                active
                  ? 'bg-cyan-500/10 border border-cyan-500/25 text-cyan-600 dark:text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.06)]'
                  : 'border border-transparent text-slate-500 dark:text-neutral-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-200 dark:hover:border-neutral-800'
              }`}
            >
              <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${
                active ? 'text-cyan-500 dark:text-cyan-400' : 'text-slate-400 dark:text-neutral-600 group-hover:text-slate-600 dark:group-hover:text-neutral-300'
              }`} />
              {(!collapsed || hideToggle) && (
                <span className={`text-sm font-semibold truncate ${
                  active ? 'text-cyan-700 dark:text-cyan-300' : ''
                }`}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      {!hideToggle && (
        <div className="border-t border-slate-200 dark:border-neutral-900 p-2">
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-slate-400 dark:text-neutral-600 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs font-semibold">Tutup</span>
              </>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
