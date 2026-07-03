'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import AdminSidebar from '../components/AdminSidebar';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRequireRole } from '@/app/hooks/useRequireRole';
import { PageLoader } from '@/components/ui/loaders';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthorized } = useRequireRole('admin');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('sidebarCollapsed');
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true');
    } else {
      setSidebarCollapsed(true);
    }
  }, []);

  const toggleSidebar = () => {
    const nextState = !sidebarCollapsed;
    setSidebarCollapsed(nextState);
    localStorage.setItem('sidebarCollapsed', String(nextState));
  };

  if (isLoading || !isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
        <PageLoader message="Memverifikasi akses admin..." />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex flex-col">
      <Navbar 
        isAdminLayout={true}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onMenuClick={() => setMobileSidebarOpen(true)} 
      />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
        />

        <AnimatePresence>
          {/* Mobile Sidebar Overlay */}
          {mobileSidebarOpen && (
            <motion.div 
              key="mobile-sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {/* Mobile Sidebar Drawer */}
          {mobileSidebarOpen && (
            <motion.div 
              key="mobile-sidebar-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 left-0 w-[260px] bg-slate-50 dark:bg-[#070710] border-r border-slate-200 dark:border-neutral-900 z-50 flex flex-col h-full shadow-2xl md:hidden"
            >
              {/* Mobile Sidebar Header */}
              <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-neutral-900 bg-white dark:bg-black/20 flex-shrink-0">
                <span className="font-extrabold text-xs uppercase tracking-widest text-slate-800 dark:text-neutral-200">
                  Menu Admin
                </span>
                <button 
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Sidebar Navigation */}
              <div className="flex-1 overflow-y-auto bg-white dark:bg-[#070710]">
                <AdminSidebar 
                   collapsed={false} 
                   onToggle={() => {}} 
                   onItemClick={() => setMobileSidebarOpen(false)}
                   hideToggle={true}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto h-full">
          {children}
        </main>
      </div>
    </div>
  );
}
