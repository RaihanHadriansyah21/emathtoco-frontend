'use client';

import { logger } from '@/lib/logger';

import React, { useEffect, useState } from 'react';
import { GraduationCap, Loader2, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ConfirmModal from '@/app/components/ConfirmModal';
import { GlassTable, GlassTableHeader, GlassTableRow, EmptyState, ResponsiveTableWrapper } from '@/components/ui/table';
import PageTransition from '@/components/ui/PageTransition';
import { PageLoader } from '@/components/ui/loaders';
import { getErrorMessage } from '@/lib/errors';

interface Lecturer {
  id: string;
  nama_lengkap: string;
  nim_nip: string;
}

interface Course {
  id: string;
  nama_matkul: string;
  kode_matkul: string;
}

interface Assignment {
  id: string;
  dosen_id: string;
  mata_kuliah_id: string;
  dosen_name: string;
  course_name: string;
  course_code: string;
}

export default function LecturerAssignmentPage() {
  const isChecking = false;
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLecturer, setSelectedLecturer] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [lecturerRes, courseRes, assignRes] = await Promise.all([
        supabase.from('profil_pengguna').select('id, nama_lengkap, nim_nip').in('role', ['dosen', 'Dosen']),
        supabase.from('mata_kuliah').select('id, nama_matkul, kode_matkul'),
        supabase.from('dosen_mata_kuliah').select('id, dosen_id, mata_kuliah_id'),
      ]);

      const dosenList = lecturerRes.data || [];
      const courseList = courseRes.data || [];
      const rawAssignments = assignRes.data || [];

      setLecturers(dosenList);
      setCourses(courseList);

      // Map assignments with names
      const mapped = rawAssignments.map(a => {
        const dosen = dosenList.find(d => d.id === a.dosen_id);
        const course = courseList.find(c => c.id === a.mata_kuliah_id);
        return {
          id: a.id,
          dosen_id: a.dosen_id,
          mata_kuliah_id: a.mata_kuliah_id,
          dosen_name: dosen?.nama_lengkap || 'Unknown',
          course_name: course?.nama_matkul || 'Unknown',
          course_code: course?.kode_matkul || '-',
        };
      });
      setAssignments(mapped);
    } catch (err) {
      logger.error('Error fetching lecturer data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedLecturer || !selectedCourse) {
      setFormError('Pilih dosen dan mata kuliah.');
      return;
    }
    // Check duplicate
    if (assignments.some(a => a.dosen_id === selectedLecturer && a.mata_kuliah_id === selectedCourse)) {
      setFormError('Dosen sudah ditugaskan ke mata kuliah ini.');
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      const { data, error } = await supabase.from('dosen_mata_kuliah').insert({ dosen_id: selectedLecturer, mata_kuliah_id: selectedCourse }).select().single();
      if (error) throw error;
      if (data) {
        const dosen = lecturers.find(d => d.id === selectedLecturer);
        const course = courses.find(c => c.id === selectedCourse);
        setAssignments(prev => [...prev, {
          id: data.id,
          dosen_id: selectedLecturer,
          mata_kuliah_id: selectedCourse,
          dosen_name: dosen?.nama_lengkap || 'Unknown',
          course_name: course?.nama_matkul || 'Unknown',
          course_code: course?.kode_matkul || '-',
        }]);
      }
      setShowAddModal(false);
      setSelectedLecturer('');
      setSelectedCourse('');
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'Gagal menambahkan assignment.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('dosen_mata_kuliah').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      setAssignments(prev => prev.filter(a => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      logger.error('Error deleting assignment:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Group assignments by lecturer
  const groupedByLecturer = lecturers.map(lec => ({
    ...lec,
    courses: assignments.filter(a => a.dosen_id === lec.id),
  }));

  if (isChecking) {
    return <PageLoader message="Memverifikasi admin..." />;
  }

  return (
    <PageTransition>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <GraduationCap className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
            Penugasan Dosen
          </h1>
          <p className="text-slate-500 dark:text-neutral-400 text-sm mt-1">Kelola penugasan dosen ke mata kuliah.</p>
        </div>
        <button onClick={() => { setShowAddModal(true); setFormError(''); }} className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all cursor-pointer shadow-lg shadow-cyan-500/10">
          <Plus className="w-4 h-4" /> Tambah Penugasan
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-cyan-500 dark:text-cyan-400 animate-spin" /></div>
      ) : groupedByLecturer.length === 0 ? (
        <ResponsiveTableWrapper>
          <EmptyState 
            title="Belum ada dosen terdaftar" 
            description="Silakan tambahkan data dosen terlebih dahulu." 
          />
        </ResponsiveTableWrapper>
      ) : (
        <ResponsiveTableWrapper>
          <GlassTable className="min-w-[800px]">
            <GlassTableHeader>
              <tr>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Dosen Pengajar</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">NIM/NIP</th>
                <th className="py-3 px-5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 whitespace-nowrap">Mata Kuliah Ditugaskan</th>
              </tr>
            </GlassTableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-neutral-900/50">
              {groupedByLecturer.map(lec => (
                <GlassTableRow key={lec.id}>
                  <td className="py-3 px-5 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold uppercase">
                        {lec.nama_lengkap?.charAt(0) || 'D'}
                      </div>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">{lec.nama_lengkap}</span>
                    </div>
                  </td>
                  <td className="py-3 px-5 text-sm font-mono text-slate-500 dark:text-neutral-400 whitespace-nowrap">{lec.nim_nip || '-'}</td>
                  <td className="py-3 px-5">
                    {lec.courses.length === 0 ? (
                      <span className="text-xs text-slate-400 dark:text-neutral-600 italic">Belum ada mata kuliah ditugaskan.</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {lec.courses.map(a => (
                          <div key={a.id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 group">
                            <span>{a.course_name}</span>
                            <button onClick={() => setDeleteTarget(a)} className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5 hover:text-red-400">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </GlassTableRow>
              ))}
            </tbody>
          </GlassTable>
        </ResponsiveTableWrapper>
      )}

      {/* Add Assignment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#0D0D14] border border-slate-200 dark:border-neutral-800 rounded-2xl p-6 shadow-2xl">
            <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 p-1 text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5">Tambah Penugasan Dosen</h3>
            {formError && <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">{formError}</p>}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Dosen</label>
                <select value={selectedLecturer} onChange={(e) => setSelectedLecturer(e.target.value)} className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 cursor-pointer">
                  <option value="">Pilih dosen...</option>
                  {lecturers.map(l => <option key={l.id} value={l.id}>{l.nama_lengkap}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-neutral-400 mb-1.5">Mata Kuliah</label>
                <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)} className="w-full bg-slate-50 dark:bg-black border border-slate-200 dark:border-neutral-800 rounded-xl py-2.5 px-4 text-sm text-slate-800 dark:text-white focus:outline-none focus:border-cyan-500/60 cursor-pointer">
                  <option value="">Pilih mata kuliah...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.nama_matkul} ({c.kode_matkul})</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-500 dark:text-neutral-400 bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 cursor-pointer transition-all">Batal</button>
              <button onClick={handleAssign} disabled={isSaving} className="px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white cursor-pointer disabled:opacity-50 transition-all">{isSaving ? 'Menyimpan...' : 'Tugaskan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Penugasan"
        message={`Hapus penugasan ${deleteTarget?.dosen_name} dari ${deleteTarget?.course_name}?`}
        confirmLabel="Hapus"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
    </PageTransition>
  );
}
