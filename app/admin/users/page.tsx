'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Search, Loader2, ChevronLeft, ChevronRight, Shield, GraduationCap, User as UserIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import ConfirmModal from '@/app/components/ConfirmModal';
import { useToast } from '@/app/hooks/useToast';
import ToastContainer from '@/app/components/Toast';

interface UserProfile {
  id: string;
  nama_lengkap: string;
  nim_nip: string;
  kelas: string;
  role: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 20;

const roleOptions = ['mahasiswa', 'dosen', 'admin'];

const roleBadge = (role: string) => {
  switch (normalizeRole(role)) {
    case 'admin': return { bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', text: 'text-indigo-500 dark:text-indigo-400', icon: Shield };
    case 'dosen': return { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-500 dark:text-cyan-400', icon: GraduationCap };
    default: return { bg: 'bg-neutral-500/10', border: 'border-neutral-500/20', text: 'text-slate-500 dark:text-neutral-400', icon: UserIcon };
  }
};

export default function UserManagementPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const [isChecking, setIsChecking] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Role change modal
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ id: string; name: string; newRole: string } | null>(null);
  const [isChangingRole, setIsChangingRole] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        const { data: profile } = await supabase.from('profil_pengguna').select('role').eq('id', user.id).maybeSingle();
        if (normalizeRole(profile?.role) !== 'admin') { router.push('/'); return; }
        setIsChecking(false);
        fetchUsers();
      } catch { router.push('/'); }
    };
    checkAdmin();
  }, [router]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profil_pengguna')
        .select('id, nama_lengkap, nim_nip, kelas, role, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleChangeTarget) return;
    setIsChangingRole(true);
    try {
      console.log(`[Role Change Request] Target User ID: ${roleChangeTarget.id}, New Role: ${roleChangeTarget.newRole}`);

      // 1. Local validation (first line of defense)
      const localUser = users.find(u => u.id === roleChangeTarget.id);
      if (normalizeRole(localUser?.role) === 'admin') {
        console.warn(`[Role Change Blocked] Local validation blocked attempt to modify admin: ${roleChangeTarget.id}`);
        toast.error('Gagal Mengubah Role', 'Administrator accounts cannot be modified.');
        setRoleChangeTarget(null);
        return;
      }

      // 2. Backend validation (fetch from DB to verify current state)
      const { data: currentProfile, error: fetchErr } = await supabase
        .from('profil_pengguna')
        .select('role')
        .eq('id', roleChangeTarget.id)
        .single();

      if (fetchErr) {
        console.error('[Role Change Error] Failed to fetch current profile before update:', fetchErr);
        throw new Error('Gagal memverifikasi data profil pengguna.');
      }

      console.log(`[Role Change DB Check] User Current Role: ${currentProfile?.role}`);
      if (normalizeRole(currentProfile?.role) === 'admin') {
        console.warn(`[Role Change Blocked] Backend validation blocked attempt to modify admin: ${roleChangeTarget.id}`);
        toast.error('Gagal Mengubah Role', 'Administrator accounts cannot be modified.');
        setRoleChangeTarget(null);
        return;
      }

      // Perform update with .select() to verify changes were actually applied (and RLS did not silently filter it)
      const { data, error } = await supabase
        .from('profil_pengguna')
        .update({ role: roleChangeTarget.newRole })
        .eq('id', roleChangeTarget.id)
        .select();

      if (error) {
        console.error('[Role Change DB Error] Update query error:', error);
        throw error;
      }

      console.log('[Role Change DB Response] Data:', data);

      if (!data || data.length === 0) {
        console.error('[Role Change Blocked] Update query executed successfully but 0 rows affected. RLS policies likely blocked the update.');
        throw new Error('Gagal memperbarui database. Perubahan diblokir oleh sistem keamanan RLS.');
      }

      console.log('[Role Change Success] DB update confirmed. Updating local state.');
      setUsers(prev => prev.map(u => u.id === roleChangeTarget.id ? { ...u, role: roleChangeTarget.newRole } : u));
      toast.success('Ubah Role Berhasil', `Peran untuk "${roleChangeTarget.name}" berhasil diubah menjadi "${roleChangeTarget.newRole}".`);
      setRoleChangeTarget(null);
    } catch (err: any) {
      console.error('[Role Change Error] Exception occurred:', err);
      toast.error('Gagal Mengubah Role', err.message || 'Terjadi kesalahan saat mengubah peran.');
    } finally {
      setIsChangingRole(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      console.log(`[Delete User Request] Target User ID: ${deleteTarget.id}`);

      // 1. Local validation (first line of defense)
      const localUser = users.find(u => u.id === deleteTarget.id);
      if (normalizeRole(localUser?.role) === 'admin') {
        console.warn(`[Delete User Blocked] Local validation blocked attempt to delete admin: ${deleteTarget.id}`);
        toast.error('Gagal Menghapus', 'Administrator accounts cannot be deleted.');
        setDeleteTarget(null);
        return;
      }

      // 2. Call backend endpoint to delete from both Auth and DB
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        throw new Error('API URL belum dikonfigurasi. Pastikan NEXT_PUBLIC_API_URL sudah diatur di .env.local.');
      }

      const response = await fetch(`${apiUrl}/admin/user/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[Delete User API Error]', result);
        throw new Error(result.detail || 'Gagal menghapus pengguna dari server.');
      }

      console.log('[Delete User Success]', result);
      setUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
      toast.success('Hapus Berhasil', `Pengguna "${deleteTarget.name}" berhasil dihapus sepenuhnya (profil & akun autentikasi).`);
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('[Delete User Error] Exception occurred:', err);
      toast.error('Gagal Menghapus', err.message || 'Terjadi kesalahan saat menghapus pengguna.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.nama_lengkap?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.nim_nip?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.kelas?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || normalizeRole(u.role) === normalizeRole(roleFilter);
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const formatDate = (iso: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
          <Users className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
          Manajemen Pengguna
        </h1>
        <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Kelola semua pengguna E-MATHTOCO — Mahasiswa, Dosen, dan Admin.</p>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 backdrop-blur-md flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-grow w-full sm:w-auto">
          <Search className="absolute left-4 top-3 w-4 h-4 text-slate-400 dark:text-neutral-600" />
          <input
            type="text"
            placeholder="Cari nama, NIM, atau kelas..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-2.5 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {['all', ...roleOptions].map(r => (
            <button
              key={r}
              onClick={() => { setRoleFilter(r); setCurrentPage(1); }}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${roleFilter === r
                ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
                : 'bg-slate-100 dark:bg-neutral-950/40 border border-slate-200 dark:border-transparent text-slate-500 dark:text-neutral-400 hover:bg-slate-200 dark:hover:bg-neutral-900/30'
                }`}
            >
              {r === 'all' ? 'Semua' : r.charAt(0).toUpperCase() + r.slice(1)}
              <span className="ml-1 text-[10px] font-mono opacity-60">
                ({r === 'all' ? users.length : users.filter(u => normalizeRole(u.role) === normalizeRole(r)).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-neutral-900 bg-slate-50 dark:bg-black/40">
                  <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Nama Lengkap</th>
                  <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">NIM/NIP</th>
                  <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Kelas</th>
                  <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Role</th>
                  <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Terdaftar</th>
                  <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-900/50">
                {paginatedUsers.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-slate-400 dark:text-neutral-500 text-sm">Tidak ada pengguna ditemukan.</td></tr>
                ) : paginatedUsers.map((user) => {
                  const badge = roleBadge(user.role);
                  const Icon = badge.icon;
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01] transition-colors group">
                      <td className="py-3 px-5 whitespace-nowrap">
                        <span className="text-sm font-semibold text-slate-800 dark:text-white">{user.nama_lengkap}</span>
                      </td>
                      <td className="py-3 px-5 text-sm font-mono text-slate-500 dark:text-neutral-400 whitespace-nowrap">{user.nim_nip || '-'}</td>
                      <td className="py-3 px-5 text-sm text-slate-600 dark:text-neutral-300 whitespace-nowrap">{user.kelas || '-'}</td>
                      <td className="py-3 px-5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${badge.bg} ${badge.border} ${badge.text}`}>
                          <Icon className="w-3 h-3" /> {normalizeRole(user.role) === 'admin' ? 'Administrator Utama' : user.role}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-xs text-slate-400 dark:text-neutral-500 whitespace-nowrap">{formatDate(user.created_at)}</td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {normalizeRole(user.role) === 'admin' ? (
                            <>
                              <span
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold select-none cursor-default"
                                title="Administrator accounts cannot be modified."
                              >
                                🔒 Administrator Utama
                              </span>
                              <span
                                className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-neutral-400 dark:text-neutral-500 text-xs font-bold select-none cursor-default opacity-60"
                                title="Administrator accounts cannot be modified."
                              >
                                System Account
                              </span>
                            </>
                          ) : (
                            <>
                              <select
                                value={user.role}
                                onChange={(e) => setRoleChangeTarget({ id: user.id, name: user.nama_lengkap, newRole: e.target.value })}
                                className="text-xs bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 rounded-lg px-2 py-1.5 text-slate-700 dark:text-neutral-300 cursor-pointer focus:outline-none focus:border-cyan-500/60"
                              >
                                {['Mahasiswa', 'Dosen'].map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => setDeleteTarget({ id: user.id, name: user.nama_lengkap })}
                                className="text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-500/20 hover:border-red-500/40 transition-all cursor-pointer font-bold"
                              >
                                Hapus
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-slate-200 dark:border-neutral-900 px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-400 dark:text-neutral-500">
                Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} dari {filteredUsers.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-white disabled:opacity-30 cursor-pointer transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-600 dark:text-neutral-300">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 hover:text-slate-800 dark:hover:text-white disabled:opacity-30 cursor-pointer transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Role Change Modal */}
      <ConfirmModal
        isOpen={!!roleChangeTarget}
        onClose={() => setRoleChangeTarget(null)}
        onConfirm={handleRoleChange}
        title="Ubah Role Pengguna"
        message={`Apakah Anda yakin ingin mengubah role "${roleChangeTarget?.name}" menjadi "${roleChangeTarget?.newRole}"? Perubahan ini tidak menghapus data apa pun.`}
        confirmLabel="Ubah Role"
        isLoading={isChangingRole}
      />

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Pengguna"
        message={`Apakah Anda yakin ingin menghapus "${deleteTarget?.name}" sepenuhnya? Akun autentikasi dan semua data profil akan dihapus permanen. Pengguna tidak akan bisa login lagi. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        variant="danger"
        isLoading={isDeleting}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
