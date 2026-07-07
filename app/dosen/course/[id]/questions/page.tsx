'use client';

import { logger } from '@/lib/logger';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BookOpen, CheckCircle, ImagePlus, Loader2, Lock, Save, Trash2, UploadCloud } from 'lucide-react';

import Navbar from '@/app/components/Navbar';
import ToastContainer from '@/app/components/Toast';
import PageTransition from '@/components/ui/PageTransition';
import { useAuth } from '@/app/components/AuthGate';
import { useToast } from '@/app/hooks/useToast';
import { supabase } from '@/lib/supabase';
import {
  FIXED_SECTION_LABEL,
  createBlankQuestionSet,
  deleteQuestionAsset,
  fetchEditableQuestionSet,
  groupSectionsByQuestion,
  publishQuestionSet,
  updateQuestionSection,
  uploadQuestionAsset,
  type QuestionSection,
  type QuestionSet,
} from '@/lib/question-bank';

export default function LecturerQuestionManagerPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  const { user } = useAuth();
  const { toasts, toast, removeToast } = useToast();

  const [isChecking, setIsChecking] = useState(true);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [uploadingCode, setUploadingCode] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const groupedSections = useMemo(
    () => questionSet ? groupSectionsByQuestion(questionSet.sections) : new Map<number, QuestionSection[]>(),
    [questionSet],
  );

  const reloadQuestionSet = useCallback(async () => {
    const editable = await fetchEditableQuestionSet(courseId);
    setQuestionSet(editable);
  }, [courseId]);

  useEffect(() => {
    if (!user) return;

    const verifyAccess = async () => {
      try {
        const [assignmentResult, courseResult] = await Promise.all([
          supabase
            .from('dosen_mata_kuliah')
            .select('id')
            .eq('dosen_id', user.id)
            .eq('mata_kuliah_id', courseId)
            .maybeSingle(),
          supabase
            .from('mata_kuliah')
            .select('nama_matkul, kode_matkul')
            .eq('id', courseId)
            .maybeSingle(),
        ]);

        if (user.role !== 'admin' && (assignmentResult.error || !assignmentResult.data)) {
          setIsAccessDenied(true);
          setIsChecking(false);
          setIsLoading(false);
          return;
        }

        if (courseResult.data) {
          setCourseName(courseResult.data.nama_matkul);
          setCourseCode(courseResult.data.kode_matkul);
        }

        await reloadQuestionSet();
      } catch (err) {
        logger.error('Failed to load question manager:', err);
        toast.error('Gagal', 'Paket soal tidak dapat dimuat.');
      } finally {
        setIsChecking(false);
        setIsLoading(false);
      }
    };

    verifyAccess();
  }, [courseId, reloadQuestionSet, toast, user]);

  const updateLocalSection = (sectionId: string, patch: Partial<QuestionSection>) => {
    setQuestionSet((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section) => (
          section.id === sectionId ? { ...section, ...patch } : section
        )),
      };
    });
  };

  const updateLocalParentPrompt = (questionNumber: number, parentPrompt: string) => {
    setQuestionSet((current) => {
      if (!current) return current;
      return {
        ...current,
        sections: current.sections.map((section) => (
          section.question_number === questionNumber ? { ...section, parent_prompt: parentPrompt } : section
        )),
      };
    });
  };

  const setSaving = (sectionId: string, isSaving: boolean) => {
    setSavingIds((current) => {
      const next = new Set(current);
      if (isSaving) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  };

  const handleCreateQuestionSet = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const title = `${courseCode || 'Paket Soal'} - 24 Section`;
      const created = await createBlankQuestionSet(courseId, title);
      setQuestionSet(created);
      toast.success('Sukses', 'Paket soal kosong 24 section berhasil dibuat.');
    } catch (err) {
      logger.error('Failed to create question set:', err);
      toast.error('Gagal', 'Paket soal gagal dibuat. Pastikan migration database sudah diterapkan.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveSection = async (section: QuestionSection) => {
    setSaving(section.id, true);
    try {
      await updateQuestionSection(section.id, {
        parent_prompt: section.parent_prompt,
        question_text: section.question_text,
        helper_text: section.helper_text,
      });
      toast.success('Tersimpan', `Soal ${section.section_code.replace('S-', '')} berhasil disimpan.`);
    } catch (err) {
      logger.error('Failed to save question section:', err);
      toast.error('Gagal', 'Section soal gagal disimpan.');
    } finally {
      setSaving(section.id, false);
    }
  };

  const handleSaveParentPrompt = async (questionNumber: number) => {
    const sections = groupedSections.get(questionNumber) ?? [];
    if (sections.length === 0) return;

    sections.forEach((section) => setSaving(section.id, true));
    try {
      await Promise.all(sections.map((section) => updateQuestionSection(section.id, {
        parent_prompt: section.parent_prompt,
        question_text: section.question_text,
        helper_text: section.helper_text,
      })));
      toast.success('Tersimpan', `Soal induk nomor ${questionNumber} berhasil disimpan untuk semua bagian.`);
    } catch (err) {
      logger.error('Failed to save parent prompt:', err);
      toast.error('Gagal', 'Soal induk gagal disimpan.');
    } finally {
      sections.forEach((section) => setSaving(section.id, false));
    }
  };

  const handleUploadAsset = async (section: QuestionSection, file: File | null) => {
    if (!questionSet || !file) return;
    setUploadingCode(section.section_code);

    try {
      await uploadQuestionAsset({
        courseId,
        questionSetId: questionSet.id,
        sectionCode: section.section_code,
        file,
        caption: `Gambar pendukung ${section.section_code}`,
      });
      await reloadQuestionSet();
      toast.success('Gambar tersimpan', `Gambar untuk ${section.section_code.replace('S-', '')} berhasil diupload.`);
    } catch (err) {
      logger.error('Failed to upload question asset:', err);
      toast.error('Gagal upload', err instanceof Error ? err.message : 'Gambar tidak dapat diupload.');
    } finally {
      setUploadingCode(null);
    }
  };

  const handleDeleteAsset = async (section: QuestionSection, assetId: string) => {
    const asset = section.assets.find((item) => item.id === assetId);
    if (!asset) return;
    setDeletingAssetId(assetId);

    try {
      await deleteQuestionAsset(asset);
      await reloadQuestionSet();
      toast.success('Dihapus', 'Gambar pendukung section berhasil dihapus.');
    } catch (err) {
      logger.error('Failed to delete question asset:', err);
      toast.error('Gagal', 'Gambar pendukung gagal dihapus.');
    } finally {
      setDeletingAssetId(null);
    }
  };

  const handlePublish = async () => {
    if (!questionSet || isPublishing) return;

    const emptySection = questionSet.sections.find((section) => !section.question_text.trim());
    if (questionSet.sections.length !== 24 || emptySection) {
      toast.error('Belum lengkap', 'Paket soal harus memiliki 24 section dan setiap section wajib punya teks soal.');
      return;
    }

    setIsPublishing(true);
    try {
      await publishQuestionSet(questionSet.id);
      await reloadQuestionSet();
      toast.success('Published', 'Paket soal aktif untuk review dosen.');
    } catch (err) {
      logger.error('Failed to publish question set:', err);
      toast.error('Gagal', 'Paket soal gagal dipublish.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
      </div>
    );
  }

  if (isAccessDenied) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans flex flex-col">
        <Navbar showBack backUrl={`/dosen/course/${courseId}`} title="Akses Ditolak" />
        <main className="flex-grow flex items-center justify-center px-4">
          <div className="max-w-md text-center space-y-4">
            <Lock className="w-10 h-10 text-red-400 mx-auto" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Tidak bisa mengelola soal</h1>
            <p className="text-sm text-slate-500 dark:text-neutral-400">Anda bukan dosen pengampu mata kuliah ini.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans pb-16 relative overflow-hidden flex flex-col">
        <ToastContainer toasts={toasts} onRemove={removeToast} />

        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/8 rounded-full blur-[120px] animate-float-blue" />
          <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/8 rounded-full blur-[130px] animate-float-purple" />
        </div>

        <Navbar />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 w-full flex-grow">
          <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <button
                onClick={() => router.push(`/dosen/course/${courseId}`)}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-[#0A0A0F]/80 dark:border-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-950 dark:hover:text-white transition-all cursor-pointer shadow-sm flex items-center justify-center flex-shrink-0"
                title="Kembali ke mata kuliah"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-6 h-6 text-cyan-500" />
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Kelola Soal Review</h1>
                </div>
                <p className="text-slate-500 dark:text-neutral-400 mt-1 text-sm">
                  Mata Kuliah: <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{courseName || 'Memuat...'}</span> {courseCode ? `(${courseCode})` : ''}
                </p>
              </div>
            </div>

            {questionSet && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                <span>{questionSet.status === 'published' ? 'PUBLISH ULANG' : 'PUBLISH PAKET SOAL'}</span>
              </button>
            )}
          </div>

          <div className="mb-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs leading-relaxed text-cyan-800 dark:text-cyan-300">
              <span className="block font-extrabold uppercase tracking-wider mb-1">Format demo terkunci</span>
              {FIXED_SECTION_LABEL} Soal hanya ditampilkan di dashboard review dosen. Mahasiswa tetap hanya melihat alur upload jawaban.
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-neutral-900 bg-white/80 dark:bg-[#0A0A0F]/80 p-4 text-xs">
              <span className="block text-slate-500 dark:text-neutral-500 uppercase tracking-widest font-bold mb-1">Status Paket</span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider ${
                questionSet?.status === 'published'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
              }`}>
                {questionSet?.status ?? 'belum dibuat'}
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white/40 dark:bg-[#0A0A0F]/20 border border-slate-200 dark:border-neutral-950 rounded-2xl gap-3">
              <Loader2 className="w-8 h-8 text-cyan-600 dark:text-cyan-400 animate-spin" />
              <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memuat paket soal...</p>
            </div>
          ) : !questionSet ? (
            <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-3xl p-8 text-center space-y-4">
              <ImagePlus className="w-12 h-12 text-cyan-500 mx-auto" />
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Belum ada paket soal</h2>
                <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">Buat paket kosong 24 section, lalu isi teks soal dan gambar pendukung jika diperlukan.</p>
              </div>
              <button
                type="button"
                onClick={handleCreateQuestionSet}
                disabled={isCreating}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white px-5 py-3 rounded-xl text-xs font-extrabold tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                BUAT PAKET SOAL 24 SECTION
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {[1, 2, 3, 4].map((questionNumber) => {
                const sections = groupedSections.get(questionNumber) ?? [];
                const parentPrompt = sections[0]?.parent_prompt ?? '';

                return (
                  <section key={questionNumber} className="bg-white dark:bg-[#0A0A0F]/75 border border-slate-200 dark:border-neutral-900 rounded-3xl p-5 sm:p-6 shadow-xl backdrop-blur-md space-y-5">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-slate-100 dark:border-neutral-900 pb-4">
                      <div className="flex-grow space-y-2">
                        <h2 className="text-sm font-extrabold uppercase tracking-[0.2em] text-slate-700 dark:text-neutral-300">Soal Induk {questionNumber}</h2>
                        <textarea
                          value={parentPrompt}
                          onChange={(event) => updateLocalParentPrompt(questionNumber, event.target.value)}
                          rows={5}
                          className="w-full bg-slate-50 border border-slate-200 dark:bg-black/60 dark:border-neutral-900 rounded-2xl p-3 text-xs leading-relaxed text-slate-800 dark:text-neutral-200 font-mono focus:outline-none focus:border-cyan-500/60 resize-y"
                          placeholder={`Tulis soal induk nomor ${questionNumber}...`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveParentPrompt(questionNumber)}
                        disabled={sections.some((section) => savingIds.has(section.id))}
                        className="inline-flex items-center justify-center gap-2 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-3.5 h-3.5" />
                        SIMPAN SOAL INDUK
                      </button>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {sections.map((section) => (
                        <div key={section.id} className="rounded-2xl border border-slate-200 dark:border-neutral-900 bg-slate-50/70 dark:bg-black/35 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-[10px] font-extrabold tracking-wider text-cyan-700 dark:text-cyan-400 uppercase">
                              Soal {section.section_code.replace('S-', '')}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-neutral-500 font-mono">Maks. {section.max_score}</span>
                          </div>

                          <textarea
                            value={section.question_text}
                            onChange={(event) => updateLocalSection(section.id, { question_text: event.target.value })}
                            rows={3}
                            className="w-full bg-white border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl p-3 text-sm text-slate-800 dark:text-neutral-200 focus:outline-none focus:border-cyan-500/60 resize-y"
                            placeholder={`Tulis teks soal ${section.section_code.replace('S-', '')}...`}
                          />

                          <textarea
                            value={section.helper_text ?? ''}
                            onChange={(event) => updateLocalSection(section.id, { helper_text: event.target.value })}
                            rows={3}
                            className="w-full bg-white border border-slate-200 dark:bg-black dark:border-neutral-900 rounded-xl p-3 text-xs font-mono text-slate-700 dark:text-neutral-300 focus:outline-none focus:border-cyan-500/60 resize-y"
                            placeholder="Rumus, matriks, atau catatan tambahan. Kosongkan jika tidak ada."
                          />

                          {section.assets.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                              {section.assets.map((asset) => (
                                <div key={asset.id} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-neutral-900 bg-white dark:bg-black">
                                  {asset.signedUrl ? (
                                    <img src={asset.signedUrl} alt={asset.caption ?? 'Gambar soal'} className="w-full h-28 object-contain" />
                                  ) : (
                                    <div className="h-28 flex items-center justify-center text-[10px] text-slate-500">Gambar tidak dapat dimuat</div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAsset(section, asset.id)}
                                    disabled={deletingAssetId === asset.id}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/90 text-white hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50"
                                    title="Hapus gambar"
                                  >
                                    {deletingAssetId === asset.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row gap-2">
                            <label className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:border-cyan-500/40 dark:bg-neutral-950 dark:border-neutral-900 text-slate-700 dark:text-neutral-300 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer">
                              {uploadingCode === section.section_code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                              UPLOAD GAMBAR
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                disabled={uploadingCode === section.section_code}
                                onChange={(event) => {
                                  const file = event.target.files?.[0] ?? null;
                                  event.target.value = '';
                                  void handleUploadAsset(section, file);
                                }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleSaveSection(section)}
                              disabled={savingIds.has(section.id)}
                              className="flex-1 inline-flex items-center justify-center gap-2 bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {savingIds.has(section.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                              SIMPAN SECTION
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
