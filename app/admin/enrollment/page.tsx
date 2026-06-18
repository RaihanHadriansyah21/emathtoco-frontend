'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, Loader2, Plus, Search, X, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import ConfirmModal from '@/app/components/ConfirmModal';
import { GlassTable, GlassTableHeader, GlassTableRow, EmptyState, ResponsiveTableWrapper } from '@/components/ui/table';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';

interface Student {
  id: string;
  nama_lengkap: string;
  nim_nip: string;
  kelas: string;
}

interface Course {
  id: string;
  nama_matkul: string;
  kode_matkul: string;
}

interface Enrollment {
  id: string;
  mahasiswa_id: string;
  mata_kuliah_id: string;
  student_name: string;
  student_nim: string;
  student_class: string;
  course_name: string;
  course_code: string;
}

const ITEMS_PER_PAGE = 20;

export default function EnrollmentPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }
        const { data: profile } = await supabase.from('profil_pengguna').select('role').eq('id', user.id).maybeSingle();
        if (normalizeRole(profile?.role) !== 'admin') { router.push('/'); return; }
        setIsChecking(false);
        fetchData();
      } catch { router.push('/'); }
    };
    checkAdmin();
  }, [router]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [studentRes, courseRes, enrollRes] = await Promise.all([
        supabase.from('profil_pengguna').select('id, nama_lengkap, nim_nip, kelas').in('role', ['mahasiswa', 'Mahasiswa']),
        supabase.from('mata_kuliah').select('id, nama_matkul, kode_matkul'),
        supabase.from('mahasiswa_mata_kuliah').select('id, mahasiswa_id, mata_kuliah_id'),
      ]);

      const studentList = studentRes.data || [];
      const courseList = courseRes.data || [];
      const rawEnroll = enrollRes.data || [];

      setStudents(studentList);
      setCourses(courseList);

      const mapped = rawEnroll.map(e => {
        const student = studentList.find(s => s.id === e.mahasiswa_id);
        const course = courseList.find(c => c.id === e.mata_kuliah_id);
        return {
          id: e.id,
          mahasiswa_id: e.mahasiswa_id,
          mata_kuliah_id: e.mata_kuliah_id,
          student_name: student?.nama_lengkap || 'Unknown',
          student_nim: student?.nim_nip || '-',
          student_class: student?.kelas || '-',
          course_name: course?.nama_matkul || 'Unknown',
          course_code: course?.kode_matkul || '-',
        };
      });
      setEnrollments(mapped);
    } catch (err) {
      console.error('Error fetching enrollment data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!selectedStudent || !selectedCourse) { setFormError('Pilih mahasiswa dan mata kuliah.'); return; }
    if (enrollments.some(e => e.mahasiswa_id === selectedStudent && e.mata_kuliah_id === selectedCourse)) {
      setFormError('Mahasiswa sudah terdaftar di mata kuliah ini.');
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      const { data, error } = await supabase.from('mahasiswa_mata_kuliah').insert({ mahasiswa_id: selectedStudent, mata_kuliah_id: selectedCourse }).select().single();
      if (error) throw error;
      if (data) {
        const student = students.find(s => s.id === selectedStudent);
        const course = courses.find(c => c.id === selectedCourse);
        setEnrollments(prev => [...prev, {
          id: data.id,
          mahasiswa_id: selectedStudent,
          mata_kuliah_id: selectedCourse,
          student_name: student?.nama_lengkap || 'Unknown',
          student_nim: student?.nim_nip || '-',
          student_class: student?.kelas || '-',
          course_name: course?.nama_matkul || 'Unknown',
          course_code: course?.kode_matkul || '-',
        }]);
      }
      setShowAddModal(false);
      setSelectedStudent('');
      setSelectedCourse('');
    } catch (err: any) {
      setFormError(err.message || 'Gagal mendaftarkan mahasiswa.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('mahasiswa_mata_kuliah').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setEnrollments(prev => prev.filter(e => e.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Error deleting enrollment:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = enrollments.filter(e => {
    const matchesSearch = e.student_name.toLowerCase().includes(searchQuery.toLowerCase()) || e.student_nim.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCourse = courseFilter === 'all' || e.mata_kuliah_id === courseFilter;
    return matchesSearch && matchesCourse;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Ambil daftar ID mahasiswa yang sudah terdaftar pada mata kuliah yang dipilih
  const enrolledStudentIds = enrollments
    .filter(e => e.mata_kuliah_id === selectedCourse)
    .map(e => e.mahasiswa_id);

  // Saring mahasiswa yang belum terdaftar di mata kuliah tersebut
  const availableStudents = students.filter(s => !enrolledStudentIds.includes(s.id));

  // Saring mahasiswa berdasarkan query pencarian di modal
  const filteredAvailableStudents = availableStudents.filter(s =>
    s.nama_lengkap.toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
    s.nim_nip.toLowerCase().includes(studentSearchQuery.toLowerCase())
  );

  const getStudentDisplayValue = () => {
    if (studentSearchQuery !== '') {
      return studentSearchQuery;
    }
    if (selectedStudent) {
      const s = students.find(x => x.id === selectedStudent);
      return s ? `${s.nama_lengkap} (${s.nim_nip})` : '';
    }
    return '';
  };

  if (isChecking) {
    return <PageLoader message="Memverifikasi admin..." />;
  }

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <UserCheck className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
            Enrollment Mahasiswa
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Kelola pendaftaran mahasiswa ke mata kuliah.</p>
        </div>
        <button onClick={() => { setShowAddModal(true); setFormError(''); setSelectedCourse(''); setSelectedStudent(''); setStudentSearchQuery(''); }} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all cursor-pointer shadow-lg shadow-emerald-500/10">
          <Plus className="w-4 h-4" /> Daftarkan Mahasiswa
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-200 dark:border-neutral-900 rounded-2xl p-4 backdrop-blur-md flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-4 top-3 w-4 h-4 text-slate-400 dark:text-neutral-600" />
          <input type="text" placeholder="Cari mahasiswa..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl py-2.5 pl-11 pr-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 transition-all placeholder:text-slate-400 dark:placeholder:text-neutral-600" />
        </div>
        <select value={courseFilter} onChange={(e) => { setCourseFilter(e.target.value); setCurrentPage(1); }}
          className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-900 rounded-xl py-2.5 px-4 text-sm text-slate-700 dark:text-neutral-300 focus:outline-none focus:border-cyan-500/60 cursor-pointer">
          <option value="all">Semua Matkul</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.nama_matkul}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>
      ) : (
        <ResponsiveTableWrapper>
          <GlassTable className="min-w-[750px]">
            <GlassTableHeader>
              <tr>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Mahasiswa</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">NIM</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Kelas</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Mata Kuliah</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </GlassTableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-900/50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12">
                    <EmptyState 
                      title="Belum ada enrollment" 
                      description="Belum ada data pendaftaran mahasiswa."
                    />
                  </td>
                </tr>
              ) : paginated.map(e => (
                <GlassTableRow key={e.id}>
                  <td className="py-3 px-5 text-sm font-semibold text-slate-800 dark:text-white whitespace-nowrap">{e.student_name}</td>
                  <td className="py-3 px-5 text-xs font-mono text-slate-500 dark:text-neutral-400 whitespace-nowrap">{e.student_nim}</td>
                  <td className="py-3 px-5 text-sm text-slate-600 dark:text-neutral-300 whitespace-nowrap">{e.student_class}</td>
                  <td className="py-3 px-5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-600 dark:text-indigo-400">{e.course_name}</span>
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <button onClick={() => setDeleteTarget(e)} className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 hover:bg-red-500/20 transition-all cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </GlassTableRow>
              ))}
            </tbody>
          </GlassTable>
          {totalPages > 1 && (
            <div className="border-t border-slate-200 dark:border-neutral-900 px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-400 dark:text-neutral-500">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} dari {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 disabled:opacity-30 cursor-pointer transition-all"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs font-bold text-slate-600 dark:text-neutral-300">{currentPage}/{totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-500 dark:text-neutral-400 disabled:opacity-30 cursor-pointer transition-all"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </ResponsiveTableWrapper>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#0D0D14] border border-slate-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl">
            <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 p-1 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5">Daftarkan Mahasiswa</h3>
            {formError && <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{formError}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Mata Kuliah</label>
                <select 
                  value={selectedCourse} 
                  onChange={(e) => { 
                    setSelectedCourse(e.target.value); 
                    setSelectedStudent(''); 
                    setStudentSearchQuery(''); 
                  }} 
                  className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 cursor-pointer"
                >
                  <option value="">Pilih mata kuliah...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.nama_matkul} ({c.kode_matkul})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Mahasiswa</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={
                      !selectedCourse
                        ? "Pilih mata kuliah terlebih dahulu..."
                        : "Ketik nama atau NIM mahasiswa..."
                    }
                    value={getStudentDisplayValue()}
                    disabled={!selectedCourse}
                    onChange={(e) => {
                      setStudentSearchQuery(e.target.value);
                      setIsStudentDropdownOpen(true);
                      setSelectedStudent(''); // Reset selection when user types new query
                    }}
                    onFocus={() => {
                      if (selectedCourse) {
                        setIsStudentDropdownOpen(true);
                      }
                    }}
                    onBlur={() => {
                      // Jeda agar event click opsi dropdown terpicu sebelum list menutup
                      setTimeout(() => {
                        setIsStudentDropdownOpen(false);
                        setStudentSearchQuery('');
                      }, 200);
                    }}
                    className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 disabled:opacity-50"
                  />
                  {isStudentDropdownOpen && selectedCourse && (
                    <div className="absolute z-[110] left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-[#0D0D14] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-2xl divide-y divide-slate-100 dark:divide-neutral-900/50">
                      {filteredAvailableStudents.length === 0 ? (
                        <div className="py-2.5 px-4 text-xs text-slate-400 dark:text-neutral-500">Tidak ada mahasiswa yang cocok/belum terdaftar.</div>
                      ) : (
                        filteredAvailableStudents.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedStudent(s.id);
                              setStudentSearchQuery('');
                              setIsStudentDropdownOpen(false);
                            }}
                            className="w-full text-left py-2.5 px-4 text-sm text-slate-700 dark:text-neutral-350 hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors flex flex-col cursor-pointer"
                          >
                            <span className="font-semibold text-slate-900 dark:text-white">{s.nama_lengkap}</span>
                            <span className="text-xs text-slate-500 dark:text-neutral-500">NIM: {s.nim_nip} | Kelas: {s.kelas}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 cursor-pointer transition-all">Batal</button>
              <button onClick={handleEnroll} disabled={isSaving} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white cursor-pointer disabled:opacity-50 transition-all">{isSaving ? 'Menyimpan...' : 'Daftarkan'}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Hapus Enrollment" message={`Hapus ${deleteTarget?.student_name} dari ${deleteTarget?.course_name}?`} confirmLabel="Hapus" variant="danger" isLoading={isDeleting} />
    </div>
    </PageTransition>
  );
}
