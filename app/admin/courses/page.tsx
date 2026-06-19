'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Search, Loader2, Plus, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import ConfirmModal from '@/app/components/ConfirmModal';
import { GlassTable, GlassTableHeader, GlassTableRow, EmptyState, ResponsiveTableWrapper } from '@/components/ui/table';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';
import { useToast } from '@/app/hooks/useToast';
import ToastContainer from '@/app/components/Toast';
import { apiDelete } from '@/lib/api-client';

interface Course {
  id: string;
  nama_matkul: string;
  kode_matkul: string;
  nama_dosen: string;
  icon_name: string;
  created_at: string;
}

const iconOptions = [
  { value: 'security', label: '🔒 Security' },
  { value: 'compress', label: '🗜️ Compress' },
  { value: 'ai', label: '🤖 AI' },
  { value: 'network', label: '📡 Network' },
  { value: 'math', label: '📘 Math' },
];

const iconMap: Record<string, string> = { security: '🔒', compress: '🗜️', ai: '🤖', network: '📡', math: '📘' };

export default function CourseManagementPage() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const [isChecking, setIsChecking] = useState(true);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [formData, setFormData] = useState({ nama_matkul: '', kode_matkul: '', nama_dosen: '', icon_name: 'math' });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        const { data: profile } = await supabase.from('profil_pengguna').select('role').eq('id', user.id).maybeSingle();
        if (normalizeRole(profile?.role) !== 'admin') { router.push('/'); return; }
        setIsChecking(false);
        fetchCourses();
      } catch { router.push('/'); }
    };
    checkAdmin();
  }, [router]);

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('mata_kuliah').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setCourses(data || []);
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const openAddForm = () => {
    setEditingCourse(null);
    setFormData({ nama_matkul: '', kode_matkul: '', nama_dosen: '', icon_name: 'math' });
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (course: Course) => {
    setEditingCourse(course);
    setFormData({ nama_matkul: course.nama_matkul, kode_matkul: course.kode_matkul, nama_dosen: course.nama_dosen, icon_name: course.icon_name || 'math' });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.nama_matkul.trim() || !formData.kode_matkul.trim()) {
      setFormError('Nama dan kode mata kuliah wajib diisi.');
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      if (editingCourse) {
        const { error } = await supabase.from('mata_kuliah').update(formData).eq('id', editingCourse.id);
        if (error) throw error;
        setCourses(prev => prev.map(c => c.id === editingCourse.id ? { ...c, ...formData } : c));
      } else {
        const { data, error } = await supabase.from('mata_kuliah').insert(formData).select().single();
        if (error) throw error;
        if (data) setCourses(prev => [data, ...prev]);
      }
      setShowForm(false);
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan mata kuliah.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      console.log(`[Delete Course] Sending backend deletion request for course ID: ${deleteTarget.id}`);
      const res = await apiDelete(`/admin/course/${deleteTarget.id}`);
      if (!res.ok) {
        let errorMsg = 'Gagal menghapus mata kuliah pada backend.';
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) {
            errorMsg = errJson.detail;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }

      setCourses(prev => prev.filter(c => c.id !== deleteTarget.id));
      toast.success('Hapus Berhasil', `Mata kuliah "${deleteTarget.nama_matkul}" berhasil dihapus beserta seluruh berkas & data terkait.`);
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Error deleting course:', err);
      toast.error('Gagal Menghapus', err.message || 'Terjadi kesalahan saat menghapus mata kuliah.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCourses = courses.filter(c =>
    c.nama_matkul?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.kode_matkul?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.nama_dosen?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (iso: string) => {
    if (!iso) return 'Tidak tersedia';
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (isChecking) {
    return <PageLoader message="Memverifikasi admin..." />;
  }

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
            Manajemen Mata Kuliah
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Tambah, edit, dan hapus mata kuliah E-MATHTOCO.</p>
        </div>
        <button
          onClick={openAddForm}
          className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all cursor-pointer shadow-lg shadow-cyan-500/10"
        >
          <Plus className="w-4 h-4" /> Tambah Matkul
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 backdrop-blur-md">
        <div className="relative">
          <Search className="absolute left-4 top-3 w-4 h-4 text-slate-400 dark:text-neutral-600" />
          <input
            type="text"
            placeholder="Cari nama matkul, kode, atau dosen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-2.5 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600"
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>
      ) : (
        <ResponsiveTableWrapper>
          <GlassTable className="min-w-[800px]">
            <GlassTableHeader>
              <tr>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Icon</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Nama Mata Kuliah</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Kode</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Dosen</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Dibuat</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </GlassTableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-900/50">
              {filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <EmptyState 
                      title="Tidak ada mata kuliah" 
                      description="Tidak ada mata kuliah ditemukan."
                    />
                  </td>
                </tr>
              ) : filteredCourses.map((course) => (
                <GlassTableRow key={course.id}>
                  <td className="py-3 px-5 text-xl whitespace-nowrap">{iconMap[course.icon_name] || '📚'}</td>
                  <td className="py-3 px-5 text-sm font-semibold text-slate-800 dark:text-white whitespace-nowrap">{course.nama_matkul}</td>
                  <td className="py-3 px-5 text-xs font-mono text-slate-500 dark:text-neutral-400 uppercase tracking-wider whitespace-nowrap">{course.kode_matkul}</td>
                  <td className="py-3 px-5 text-sm text-slate-600 dark:text-neutral-300 whitespace-nowrap">{course.nama_dosen || '-'}</td>
                  <td className="py-3 px-5 text-xs text-slate-400 dark:text-neutral-500 whitespace-nowrap">{formatDate(course.created_at)}</td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEditForm(course)} className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 dark:text-cyan-400 hover:bg-cyan-500/20 transition-all cursor-pointer">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(course)} className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-500/20 transition-all cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </GlassTableRow>
              ))}
            </tbody>
          </GlassTable>
        </ResponsiveTableWrapper>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0D0D14] border border-slate-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl dark:shadow-[0_0_60px_rgba(0,0,0,0.9)]">
            <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:text-neutral-500 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer">
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5">{editingCourse ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah'}</h3>

            {formError && <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{formError}</p>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Nama Mata Kuliah</label>
                <input value={formData.nama_matkul} onChange={(e) => setFormData(p => ({ ...p, nama_matkul: e.target.value }))} className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all" placeholder="Kriptografi" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Kode Mata Kuliah</label>
                <input value={formData.kode_matkul} onChange={(e) => setFormData(p => ({ ...p, kode_matkul: e.target.value }))} className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all font-mono uppercase" placeholder="IF-4401" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Nama Dosen</label>
                <input value={formData.nama_dosen} onChange={(e) => setFormData(p => ({ ...p, nama_dosen: e.target.value }))} className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all" placeholder="Dr. Budi" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {iconOptions.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFormData(p => ({ ...p, icon_name: opt.value }))}
                      className={`px-3 py-2 rounded-xl text-sm border transition-all cursor-pointer ${
                        formData.icon_name === opt.value
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
                          : 'bg-slate-50 dark:bg-neutral-950 border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-400 hover:border-slate-300 dark:hover:border-neutral-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-800 transition-all cursor-pointer">Batal</button>
              <button onClick={handleSave} disabled={isSaving} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-500/10">
                {isSaving ? 'Menyimpan...' : editingCourse ? 'Simpan Perubahan' : 'Tambah'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Mata Kuliah"
        message={`Apakah Anda yakin ingin menghapus "${deleteTarget?.nama_matkul}"? Semua data mahasiswa, nilai, dan lembar jawaban terunggah di mata kuliah ini akan dihapus secara permanen.`}
        confirmLabel="Hapus"
        variant="danger"
        isLoading={isDeleting}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
    </PageTransition>
  );
}
