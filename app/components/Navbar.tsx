'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, User, Settings, LogOut, Sun, Moon, Menu, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { useTheme } from 'next-themes';
import Image from 'next/image';
import Logo from '../Emathtoco.png';

interface NavbarProps {
  showBack?: boolean;
  backUrl?: string;
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
  isAdminLayout?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const getDisplayName = (fullName: string) => {
  if (!fullName) return 'User';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'User';

  const firstWord = parts[0];
  const lowerFirst = firstWord.toLowerCase();

  if ((lowerFirst === 'muhammad' || lowerFirst === 'mohammad') && parts.length > 1) {
    return parts[1];
  }

  return firstWord;
};

const getInitials = (displayName: string) => {
  if (!displayName || displayName === 'User') return 'U';
  return displayName.charAt(0).toUpperCase();
};

export default function Navbar({ 
  showBack = false, 
  backUrl = '/', 
  title, 
  subtitle, 
  onMenuClick,
  isAdminLayout = false,
  sidebarCollapsed = false,
  onToggleSidebar,
}: NavbarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('mahasiswa');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const normalizedRole = normalizeRole(role);
  
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handleAvatarUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail !== undefined) {
        setAvatarUrl(customEvent.detail);
        setImageError(false);
      }
    };
    window.addEventListener('avatar-update', handleAvatarUpdate);
    return () => {
      window.removeEventListener('avatar-update', handleAvatarUpdate);
    };
  }, []);

  useEffect(() => {
    const getNavbarData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || '');

          const { data: profile } = await supabase
            .from('profil_pengguna')
            .select('nama_lengkap, role, foto_profil_url')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.nama_lengkap) {
            setFullName(profile.nama_lengkap);
          }
          if (profile?.role) {
            setRole(profile.role);
          }
          if (profile?.foto_profil_url) {
            setAvatarUrl(profile.foto_profil_url);
            setImageError(false);
          }
        }
      } catch (err) {
        console.error('Navbar data fetch error:', err);
      }
    };
    getNavbarData();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = theme === 'system' ? resolvedTheme : theme;

  const toggleTheme = () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
    window.location.href = '/login';
  };

  return (
    <header className={`border-b border-slate-200 dark:border-neutral-900 bg-white/75 dark:bg-[#0A0A0F]/65 backdrop-blur-md sticky top-0 z-50 w-full flex-shrink-0 pt-[env(safe-area-inset-top)] ${
      isAdminLayout 
        ? 'pr-4 sm:pr-6 lg:pr-10' 
        : 'px-4 sm:px-6 lg:px-10'
    }`}>
      <div className="h-16 flex items-center justify-between">
        {/* Left section: Sidebar Area + Page context */}
        <div className="flex items-center overflow-hidden mr-4">
          {isAdminLayout ? (
            /* Admin Header Sidebar Container - width matches sidebar exactly, includes border-r */
            <div className={`flex items-center transition-all duration-300 border-r border-slate-200 dark:border-neutral-900 h-16 mr-4 relative overflow-hidden ${
              sidebarCollapsed ? 'w-[80px] justify-center px-0' : 'w-[270px] justify-between px-5'
            }`}>
              <div className={`flex items-center gap-2.5 w-full ${sidebarCollapsed ? 'justify-center' : 'justify-start'}`}>
                {/* Logo Area */}
                <div 
                  className="relative w-10 h-10 flex items-center justify-center group cursor-pointer flex-shrink-0" 
                  onClick={sidebarCollapsed ? onToggleSidebar : () => router.push('/')}
                >
                  <div className={`bg-white border border-slate-200 dark:border-neutral-750/60 rounded-xl p-1.5 shadow-sm dark:shadow-[0_0_12px_rgba(6,182,212,0.08)] flex items-center justify-center transition-all duration-200 scale-100 opacity-100 ${
                    sidebarCollapsed ? 'group-hover:scale-0 group-hover:opacity-0' : 'hover:scale-105'
                  }`}>
                    <Image
                      src={Logo}
                      alt="Logo E-MATHTOCO"
                      className="h-6 w-auto object-contain"
                      priority
                    />
                  </div>
                  {sidebarCollapsed && (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-white transition-all duration-200 scale-0 opacity-0 group-hover:scale-100 group-hover:opacity-100">
                      <Menu className="w-5 h-5" />
                    </div>
                  )}
                </div>

                {/* Brand Text */}
                <span className={`text-lg font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-950 dark:from-white dark:to-neutral-300 drop-shadow-[0_0_8px_rgba(0,0,0,0.05)] dark:drop-shadow-[0_0_8px_rgba(255,255,255,0.1)] whitespace-nowrap transition-all duration-300 origin-left overflow-hidden ${
                  sidebarCollapsed ? 'opacity-0 max-w-0 translate-x-[-10px]' : 'opacity-100 max-w-[180px] translate-x-0'
                }`}>
                  E-MATH<span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-black drop-shadow-[0_0_12px_rgba(6,182,212,0.3)]">TOCO</span>
                </span>
              </div>

              {/* Collapse Button (Fades out and hides off-screen when collapsed) */}
              <button
                onClick={onToggleSidebar}
                className={`p-2 hover:bg-slate-100 dark:hover:bg-neutral-950 border border-transparent hover:border-slate-200 dark:hover:border-neutral-900 rounded-xl text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-white transition-all duration-300 cursor-pointer flex-shrink-0 ${
                  sidebarCollapsed ? 'opacity-0 pointer-events-none absolute right-[-50px]' : 'opacity-100 pointer-events-auto'
                }`}
                title="Collapse sidebar"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
          ) : (
            /* Original Left Section (Mahasiswa/Dosen/Unauthenticated Layouts) */
            <div className="flex items-center gap-3 md:gap-4 overflow-hidden mr-4">
              {onMenuClick && (
                <button
                  onClick={onMenuClick}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-neutral-950 border border-transparent hover:border-slate-200 dark:hover:border-neutral-900 rounded-xl text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer flex-shrink-0 md:hidden"
                  title="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              )}

              {showBack && (
                <button
                  onClick={() => router.push(backUrl)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-neutral-950 border border-transparent hover:border-slate-200 dark:hover:border-neutral-900 rounded-xl text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}

              {/* Logo */}
              <div
                onClick={() => router.push('/')}
                className="flex items-center gap-2.5 cursor-pointer select-none flex-shrink-0"
              >
                <div className="bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm flex items-center justify-center flex-shrink-0">
                  <Image
                    src={Logo}
                    alt="Logo E-MATHTOCO"
                    className="h-6 w-auto object-contain"
                    priority
                  />
                </div>
                <span className={`text-xl font-bold tracking-wider text-slate-900 dark:text-white ${title ? 'hidden md:inline-block' : ''}`}>
                  E-MATH<span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent font-extrabold">TOCO</span>
                </span>
              </div>
            </div>
          )}

          {/* Page Title Context */}
          {title && (
            <div className="flex items-center gap-3">
              <div className="h-5 w-[1px] bg-slate-200 dark:bg-neutral-800 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider truncate">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[10px] text-slate-400 dark:text-neutral-500 uppercase tracking-widest truncate mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right section: Theme Toggle + Profile Dropdown */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle Button */}
          {mounted && (
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-800 dark:bg-black/40 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white dark:hover:border-cyan-500/40 transition-all duration-300 cursor-pointer flex-shrink-0"
              title={currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {currentTheme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>
          )}

          {/* Profile Dropdown */}
          <div className="relative flex-shrink-0" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-300 dark:bg-black/40 dark:border-neutral-800 dark:hover:border-cyan-500/40 transition-all duration-300 cursor-pointer select-none"
            >
              {/* Avatar circular */}
              {avatarUrl && !imageError ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  onError={() => setImageError(true)}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-neutral-800"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-inner uppercase">
                  {getInitials(getDisplayName(fullName))}
                </div>
              )}
              <span className="text-sm font-medium text-slate-700 dark:text-neutral-200 hidden sm:inline-block max-w-[120px] truncate">
                {getDisplayName(fullName)}
              </span>
              {normalizedRole !== 'mahasiswa' && (
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border tracking-wide uppercase hidden sm:inline-block ${
                  normalizedRole === 'dosen' 
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]' 
                    : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                }`}>
                  {role}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-neutral-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu card */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-250 dark:bg-[#0A0A0F]/95 dark:border-neutral-800/90 backdrop-blur-md rounded-2xl p-4 shadow-xl dark:shadow-[0_10px_40px_rgba(0,0,0,0.9)] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="mb-3 px-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-slate-800 dark:text-white truncate max-w-[140px]">{fullName || 'User'}</p>
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                      normalizedRole === 'dosen'
                        ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                        : normalizedRole === 'admin'
                          ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                          : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}>
                      {role}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-neutral-400 truncate">{userEmail}</p>
                </div>
                <div className="border-t border-slate-100 dark:border-neutral-900 my-2"></div>
                <ul className="space-y-1.5">
                  <li>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        router.push('/profile');
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-50 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/5 transition-all text-sm text-left cursor-pointer"
                    >
                      <User className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                      Profile
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => {
                        setIsDropdownOpen(false);
                        router.push('/settings');
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-50 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/5 transition-all text-sm text-left cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                      Settings
                    </button>
                  </li>
                  <li className="pt-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-red-500 hover:text-red-400 hover:bg-red-500/5 transition-all text-sm font-semibold text-left cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-red-500" />
                      Logout
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
