'use client';

import { logger } from '@/lib/logger';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Loader2, Play, CheckCircle, AlertTriangle, Eye, X, Lock, RotateCcw } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import PageTransition from '@/components/ui/PageTransition';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/app/hooks/useToast';
import ToastContainer from '@/app/components/Toast';
import { apiGet, apiPost } from '@/lib/api-client';
import {
  buildReviewPayload,
  finalizeSubmissionReview,
  requestAnswerReupload,
  saveSubmissionReview,
} from '@/lib/services/review-workflow-service';
import { getAnswerImageUrls } from '@/lib/storage/answer-image-urls';
import { getErrorMessage } from '@/lib/errors';
import {
  FIXED_SECTION_LABEL,
  fetchPublishedQuestionSet,
  groupSectionsByQuestion,
  type QuestionSection,
  type QuestionSet,
} from '@/lib/question-bank';

import { useAuth } from '@/app/components/AuthGate';

// Helper to generate the 24 section slots (1a - 4f)
const generateSlots = () => {
  const list = [];
  const bagian = ['a', 'b', 'c', 'd', 'e', 'f'];
  for (let nomor = 1; nomor <= 4; nomor++) {
    for (const b of bagian) {
      list.push({ label: `${nomor}${b}`, nomor_soal: nomor, bagian_soal: b });
    }
  }
  return list;
};

const getMaxScore = (label: string): number => {
  return label.toLowerCase().endsWith('f') ? 5 : 4;
};

interface StudentProfile {
  nama_lengkap: string;
  kelas: string;
  nim_nip: string;
}

interface Course {
  nama_matkul: string;
  kode_matkul: string;
}

interface SubmissionData {
  id: string;
  mahasiswa_id: string;
  status_submit: 'submitted' | 'processing_ai' | 'reviewed' | 'finalized' | 'failed';
  ai_status?: string | null;
  waktu_submit: string;
  nilai_akhir: number | null;
  model_ai?: string | null;
  mahasiswa: StudentProfile | StudentProfile[] | null;
  mata_kuliah: Course | Course[] | null;
}

interface SlotState {
  label: string; // e.g. "1a"
  nomor_soal: number;
  bagian_soal: string;
  hasSheet: boolean;
  sheetId?: string;
  fileUrl: string | null;
  imagePath?: string;
  aiScore: number | null;
  confidence: number | null; // Added
  manualScore: number | null; // nilai_dosen in DB
  manualCorrection: number; // Final - AI
  finalScore: number | null; // nilai_final in DB
  feedback: string; // feedback in DB
  dbStatus?: string;
  rejectionReason?: string | null;
  wasReuploaded?: boolean;
  lastReuploadAt?: string | null;
  reuploadCount?: number;
}

interface AISectionResult {
  section_code: string;
  predicted_score: number;
  confidence: number;
}

interface AIResultsData {
  ai_status: string | null;
  nilai_akhir: number | null;
  sections: AISectionResult[];
}

const isSubmissionEqual = (a: SubmissionData | null, b: SubmissionData | null): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.mahasiswa_id === b.mahasiswa_id &&
    a.status_submit === b.status_submit &&
    a.ai_status === b.ai_status &&
    a.waktu_submit === b.waktu_submit &&
    a.nilai_akhir === b.nilai_akhir &&
    a.model_ai === b.model_ai &&
    JSON.stringify(a.mahasiswa) === JSON.stringify(b.mahasiswa) &&
    JSON.stringify(a.mata_kuliah) === JSON.stringify(b.mata_kuliah)
  );
};

const areSlotsEqual = (arr1: SlotState[], arr2: SlotState[]): boolean => {
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    const s1 = arr1[i];
    const s2 = arr2[i];
    if (
      s1.label !== s2.label ||
      s1.hasSheet !== s2.hasSheet ||
      s1.sheetId !== s2.sheetId ||
      s1.aiScore !== s2.aiScore ||
      s1.confidence !== s2.confidence ||
      s1.manualScore !== s2.manualScore ||
      s1.manualCorrection !== s2.manualCorrection ||
      s1.finalScore !== s2.finalScore ||
      s1.feedback !== s2.feedback ||
      s1.dbStatus !== s2.dbStatus ||
      s1.rejectionReason !== s2.rejectionReason ||
      s1.wasReuploaded !== s2.wasReuploaded ||
      s1.lastReuploadAt !== s2.lastReuploadAt ||
      s1.reuploadCount !== s2.reuploadCount ||
      s1.imagePath !== s2.imagePath ||
      s1.fileUrl !== s2.fileUrl
    ) {
      return false;
    }
  }
  return true;
};

const buildReviewSignature = (slots: SlotState[], model: string): string => JSON.stringify({
  model,
  scores: slots
    .filter((slot) => slot.hasSheet && slot.sheetId)
    .map((slot) => ({
      label: slot.label,
      manualScore: slot.manualScore,
      finalScore: slot.finalScore,
      feedback: slot.feedback,
    })),
});

type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export default function ReviewWorkspace() {
  const router = useRouter();
  const params = useParams();
  const submissionId = params.id as string;
  const { user } = useAuth();

  // Auth and Loading States
  const [isChecking, setIsChecking] = useState(true);

  // Polling refs (BUG 2 fix)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // New state variables for UX improvement
  const [isPredicting, setIsPredicting] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [aiSuccessModel, setAiSuccessModel] = useState('');
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [isBackendOffline, setIsBackendOffline] = useState(false);

  // Submission Data
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [totalAIScore, setTotalAIScore] = useState<number | null>(null);

  // AI Simulation States
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('emathtoco_selected_model');
      if (saved === 'MobileNetV2' || saved === 'DenseNet121' || saved === 'InceptionV3') {
        return saved;
      }
    }
    return 'MobileNetV2';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('emathtoco_selected_model', selectedModel);
    }
  }, [selectedModel]);

  useEffect(() => {
    const loadDefaultModel = async () => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('emathtoco_selected_model');
        if (saved === 'MobileNetV2' || saved === 'DenseNet121' || saved === 'InceptionV3') {
          return; // Priority 1: lecturer has explicit choice, skip loading global setting
        }
      }
      try {
        const res = await apiGet('/settings');
        if (res.ok) {
          const settings = await res.json();
          if (settings.active_model) {
            setSelectedModel(settings.active_model);
          }
        }
      } catch (err) {
        logger.error('Failed to load global active model configuration:', err);
      }
    };
    loadDefaultModel();
  }, []);

  // UI Modal Preview
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState('');

  // Editing Action States
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [autoSaveMessage, setAutoSaveMessage] = useState('Perubahan nilai dan feedback akan tersimpan otomatis.');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { toasts, toast, removeToast } = useToast();

  // Reupload Request States
  const [showReuploadModal, setShowReuploadModal] = useState(false);
  const [reuploadTargetSlot, setReuploadTargetSlot] = useState<string | null>(null);
  const [reuploadReason, setReuploadReason] = useState('');
  const [isRequestingReupload, setIsRequestingReupload] = useState(false);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [questionSetError, setQuestionSetError] = useState<string | null>(null);

  // Sync state to refs for stable useCallback and polling intervals
  const submissionRef = useRef<SubmissionData | null>(null);
  const slotsRef = useRef<SlotState[]>([]);
  const totalAIScoreRef = useRef<number | null>(null);
  const selectedModelRef = useRef(selectedModel);
  const isPredictingRef = useRef(isPredicting);
  const isSavingRef = useRef(isSaving);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveReadyRef = useRef(false);
  const lastSavedReviewSignatureRef = useRef('');
  const pendingAutoSaveRef = useRef(false);

  useEffect(() => {
    submissionRef.current = submission;
  }, [submission]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    totalAIScoreRef.current = totalAIScore;
  }, [totalAIScore]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    isPredictingRef.current = isPredicting;
  }, [isPredicting]);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  const isAIActive = isPredicting ||
    submission?.ai_status === 'processing' ||
    submission?.ai_status === 'ai_pending' ||
    submission?.ai_status === 'ai_running' ||
    submission?.status_submit === 'processing_ai' ||
    (submission?.status_submit as string) === 'diproses_ai';

  const isAIProcessing = isAIActive && !isBackendOffline;
  const needsPassiveReviewRefresh = !!submission && !activeJobId && !isBackendOffline && (
    submission.status_submit === 'processing_ai' ||
    submission.ai_status === 'processing' ||
    submission.ai_status === 'ai_pending' ||
    submission.ai_status === 'ai_running'
  );

  useEffect(() => {
    const storedJobId = sessionStorage.getItem(
      `emathtoco:ai-job:${submissionId}`,
    );
    if (storedJobId) {
      setActiveJobId(storedJobId);
    }
  }, [submissionId]);

  useEffect(() => {
    if (!user) return;

    // 1. Verify lecturer role & assignment
    const verifyUser = async () => {
      try {
        // Authorization check: verify lecturer is assigned to this submission's course
        const { data: subMeta } = await supabase
          .from('pengumpulan_tugas')
          .select('mata_kuliah_id')
          .eq('id', submissionId)
          .maybeSingle();

        if (subMeta?.mata_kuliah_id) {
          setCourseId(subMeta.mata_kuliah_id);
          const { data: assignmentCheck } = await supabase
            .from('dosen_mata_kuliah')
            .select('id')
            .eq('dosen_id', user.id)
            .eq('mata_kuliah_id', subMeta.mata_kuliah_id)
            .maybeSingle();

          if (!assignmentCheck) {
            logger.warn(`[Access Denied] Lecturer ${user.id} is not assigned to course ${subMeta.mata_kuliah_id}`);
            setIsAccessDenied(true);
            setIsChecking(false);
            setIsLoadingWorkspace(false);
            return;
          }

          try {
            const publishedQuestions = await fetchPublishedQuestionSet(subMeta.mata_kuliah_id);
            setQuestionSet(publishedQuestions);
            setQuestionSetError(null);
          } catch (questionErr) {
            logger.error('Question bank load error:', questionErr);
            setQuestionSet(null);
            setQuestionSetError('Soal tidak dapat dimuat. Periksa paket soal dan akses Supabase.');
          }
        }

        setIsChecking(false);

        // Load submission and lembar_jawaban details
        loadWorkspaceDetails();
      } catch (err) {
        logger.error('Dosen verification error:', err);
        setErrorMsg('Terjadi kesalahan saat memeriksa akses kelas.');
        setIsChecking(false);
        setIsLoadingWorkspace(false);
      }
    };
    verifyUser();
  // loadWorkspaceDetails intentionally remains stable through refs; adding it
  // here would recreate the verification cycle while the initial request runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, submissionId]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
    };
  }, []);

  const loadWorkspaceDetails = useCallback(async () => {
    // Prevent overlapping fetches (BUG 2 fix)
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    const isFirstLoad = !submissionRef.current;
    if (isFirstLoad) {
      setIsLoadingWorkspace(true);
    }
    setErrorMsg(null);
    try {
      // Fetch parent submission
      const { data: subData, error: subError } = await supabase
        .from('pengumpulan_tugas')
        .select(`
          id,
          mahasiswa_id,
          status_submit,
          ai_status,
          waktu_submit,
          nilai_akhir,
          model_ai,
          mahasiswa:profil_pengguna!pengumpulan_tugas_mahasiswa_id_fkey(nama_lengkap, kelas, nim_nip),
          mata_kuliah (nama_matkul, kode_matkul)
        `)
        .eq('id', submissionId)
        .maybeSingle();

      if (subError) throw subError;
      if (!subData) {
        if (isFirstLoad) {
          setErrorMsg('Data pengumpulan tugas tidak ditemukan.');
        }
        setIsLoadingWorkspace(false);
        isFetchingRef.current = false;
        return;
      }

      // Fetch AI results from backend API
      let aiResultsData: AIResultsData | null = null;
      try {
        const aiRes = await apiGet(`/submission/${submissionId}/results`);
        if (aiRes.ok) {
          aiResultsData = await aiRes.json() as AIResultsData;
          setIsBackendOffline(false);
        } else {
          setIsBackendOffline(true);
        }
      } catch (aiErr: unknown) {
        logger.error('AI Backend Error:', aiErr);
        setIsBackendOffline(true);
        const userFriendlyMsg = (aiErr instanceof TypeError || (aiErr instanceof Error && aiErr.message.includes("fetch")))
          ? "Backend tidak dapat dihubungi. Pastikan server FastAPI berjalan dan IP backend benar."
          : getErrorMessage(aiErr, "Gagal memuat hasil AI dari backend.");
        if (isFirstLoad) {
          setErrorMsg(userFriendlyMsg);
        }
      }

      const formattedSub = subData as unknown as SubmissionData;
      if (aiResultsData) {
        formattedSub.ai_status = aiResultsData.ai_status;
        if (aiResultsData.nilai_akhir !== null) {
          formattedSub.nilai_akhir = aiResultsData.nilai_akhir;
        }
      }

      // Check if previously processing to trigger success/error banner (Requirement 5, 6, 7)
      const prevStatus = submissionRef.current?.ai_status;
      const newStatus = formattedSub.ai_status;

      const isPrevProcessing = prevStatus === 'processing' || prevStatus === 'ai_pending' || prevStatus === 'ai_running' || isPredictingRef.current;
      const isNewSuccess = newStatus === 'completed' || newStatus === 'partial';

      if (isPrevProcessing && isNewSuccess) {
        setAiSuccessModel(formattedSub.model_ai || selectedModelRef.current);
        setShowSuccessBanner(true);
        if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = setTimeout(() => {
          setShowSuccessBanner(false);
        }, 3000);
        setIsPredicting(false);
      } else if (isPrevProcessing && newStatus === 'failed') {
        setAiErrorMessage("Silakan coba kembali.");
        setIsPredicting(false);
      }

      // Compare and update submission state
      const isSubChanged = !isSubmissionEqual(submissionRef.current, formattedSub);
      if (isSubChanged) {
        setSubmission(formattedSub);
      }

      if (formattedSub.model_ai && formattedSub.model_ai !== selectedModelRef.current) {
        setSelectedModel(formattedSub.model_ai);
      }

      // Fetch answer sheets
      const { data: sheets, error: sheetsError } = await supabase
        .from('lembar_jawaban')
        .select(`
          id,
          section_code,
          image_url,
          nilai_dosen,
          nilai_final,
          feedback,
          status,
          rejection_reason,
          was_reuploaded,
          last_reupload_at,
          reupload_count
        `)
        .eq('pengumpulan_tugas_id', submissionId);

      if (sheetsError) throw sheetsError;

      // Initialize 24 slots, reusing existing fileUrl from current state if imagePath matches
      const initialSlots = generateSlots().map(s => {
        const sectionCode = `S-${s.label.toUpperCase()}`;
        const matchedSheet = sheets?.find(sh => sh.section_code === sectionCode);

        // Get AI score and confidence from backend
        const matchedSectionAI = aiResultsData?.sections?.find((section) => section.section_code === sectionCode);
        const aiScore = matchedSectionAI !== undefined && matchedSectionAI !== null ? matchedSectionAI.predicted_score : null;
        const confidence = matchedSectionAI !== undefined && matchedSectionAI !== null ? matchedSectionAI.confidence : null;

        const manualScore = matchedSheet?.nilai_dosen !== undefined && matchedSheet.nilai_dosen !== null
          ? matchedSheet.nilai_dosen
          : null;

        const finalScore = manualScore !== null
          ? manualScore
          : (matchedSheet?.nilai_final !== undefined && matchedSheet.nilai_final !== null ? matchedSheet.nilai_final : aiScore);
        const manualCorrection = (finalScore !== null && aiScore !== null) ? (finalScore - aiScore) : 0;

        const existingSlot = slotsRef.current.find(ex => ex.label === s.label);
        const fileUrl = (existingSlot && existingSlot.imagePath === matchedSheet?.image_url)
          ? existingSlot.fileUrl
          : null;

        return {
          label: s.label,
          nomor_soal: s.nomor_soal,
          bagian_soal: s.bagian_soal,
          hasSheet: !!matchedSheet,
          sheetId: matchedSheet?.id,
          fileUrl,
          imagePath: matchedSheet?.image_url,
          aiScore,
          confidence,
          manualScore,
          manualCorrection,
          finalScore,
          feedback: matchedSheet?.feedback || '',
          dbStatus: matchedSheet?.status,
          rejectionReason: matchedSheet?.rejection_reason || null,
          wasReuploaded: matchedSheet?.was_reuploaded || false,
          lastReuploadAt: matchedSheet?.last_reupload_at || null,
          reuploadCount: matchedSheet?.reupload_count || 0,
        };
      });

      // Identify all paths that need signed URLs (skip cached ones)
      const pathsToFetch = initialSlots
        .filter(slot => slot.hasSheet && slot.imagePath && !slot.fileUrl)
        .map(slot => slot.imagePath!);

      // Fetch signed URLs in bulk
      const signedUrlsMap = await getAnswerImageUrls(pathsToFetch);

      // Assign the signed URLs to the slots
      const resolvedSlots = initialSlots.map(slot => {
        if (slot.hasSheet && slot.imagePath && !slot.fileUrl) {
          const signedUrl = signedUrlsMap.get(slot.imagePath) || null;
          return { ...slot, fileUrl: signedUrl };
        }
        return slot;
      });

      // Compare and update AI total score
      const newTotalScore = aiResultsData ? aiResultsData.nilai_akhir : null;
      const isTotalAIScoreChanged = totalAIScoreRef.current !== newTotalScore;
      if (isTotalAIScoreChanged) {
        setTotalAIScore(newTotalScore);
      }

      // Compare and update slots state
      const isSlotsChanged = !areSlotsEqual(slotsRef.current, resolvedSlots);
      if (isSlotsChanged) {
        setSlots(resolvedSlots);
      }

      lastSavedReviewSignatureRef.current = buildReviewSignature(
        resolvedSlots,
        formattedSub.model_ai || selectedModelRef.current,
      );
      autoSaveReadyRef.current = true;
      if (!isSavingRef.current) {
        setAutoSaveStatus('saved');
        setAutoSaveMessage('Data review sinkron dengan database.');
      }

    } catch (err) {
      logger.error('Error loading review workspace:', err);
      if (isFirstLoad) {
        setErrorMsg('Gagal memuat detail lembar jawaban mahasiswa.');
      }
    } finally {
      setIsLoadingWorkspace(false);
      isFetchingRef.current = false;
    }
  }, [submissionId]);

  // Poll accepted RQ job with 2s → 3s → 5s backoff. Polling pauses while
  // the tab is hidden and stops at the first terminal state.
  useEffect(() => {
    if (!activeJobId) return;
    let stopped = false;
    let attempt = 0;
    const delays = [2000, 3000, 5000];

    const schedule = () => {
      if (stopped) return;
      const delay = delays[Math.min(attempt, delays.length - 1)];
      attempt += 1;
      pollingRef.current = setTimeout(poll, delay);
    };

    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        schedule();
        return;
      }
      try {
        const response = await apiGet(`/jobs/${activeJobId}`);
        if (response.ok) {
          const job = await response.json() as {
            status: 'queued' | 'started' | 'completed' | 'failed';
            error_code?: string | null;
            completed_ids?: string[];
            failed?: Record<string, string>;
          };
          if (job.status === 'completed' || job.status === 'failed') {
            stopped = true;
            sessionStorage.removeItem(`emathtoco:ai-job:${submissionId}`);
            setActiveJobId(null);
            await loadWorkspaceDetails();
            const submissionError = job.failed?.[submissionId];
            if (job.status === 'failed' || submissionError) {
              const errorCode =
                submissionError || job.error_code || 'AI_JOB_FAILED';
              setAiErrorMessage(errorCode);
              toast.error(
                'Prediksi AI Gagal',
                'Worker tidak dapat menyelesaikan seluruh section.',
              );
            } else {
              toast.success(
                'Prediksi AI Selesai',
                'Nilai dan hasil setiap section sudah diperbarui.',
              );
            }
            return;
          }
        }
      } catch {
        setIsBackendOffline(true);
      }
      schedule();
    };

    void poll();

    return () => {
      stopped = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeJobId, loadWorkspaceDetails, submissionId, toast]);

  // Passive refresh covers the common demo flow where AI/batch is started from
  // the course dashboard, then the lecturer opens a review page while the worker
  // is still processing. In that case this page does not own a job_id, so it
  // must still re-fetch until the submission leaves the pending/processing state.
  useEffect(() => {
    if (!needsPassiveReviewRefresh) return;

    const refreshIfVisible = () => {
      if (document.visibilityState !== 'hidden') {
        void loadWorkspaceDetails();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, 4000);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [loadWorkspaceDetails, needsPassiveReviewRefresh]);

  // Handle manual score change
  const handleManualScoreChange = (label: string, value: string) => {
    const maxScore = getMaxScore(label);
    const manualVal = value === '' ? null : Math.max(0, Math.min(maxScore, parseInt(value) || 0));

    setSlots(prev => prev.map(slot => {
      if (slot.label === label) {
        const finalScore = manualVal !== null ? manualVal : slot.aiScore;
        const correction = (finalScore !== null && slot.aiScore !== null) ? (finalScore - slot.aiScore) : 0;
        return {
          ...slot,
          manualScore: manualVal,
          finalScore: finalScore,
          manualCorrection: correction
        };
      }
      return slot;
    }));
  };

  // Handle final score change directly
  const handleFinalScoreChange = (label: string, value: string) => {
    const maxScore = getMaxScore(label);
    const finalVal = value === '' ? null : Math.max(0, Math.min(maxScore, parseInt(value) || 0));

    setSlots(prev => prev.map(slot => {
      if (slot.label === label) {
        const finalScore = finalVal !== null ? finalVal : slot.aiScore;
        const manualVal = finalVal;
        const correction = (finalScore !== null && slot.aiScore !== null) ? (finalScore - slot.aiScore) : 0;
        return {
          ...slot,
          manualScore: manualVal,
          finalScore: finalScore,
          manualCorrection: correction
        };
      }
      return slot;
    }));
  };

  // Handle feedback text change
  const handleFeedbackChange = (label: string, text: string) => {
    setSlots(prev => prev.map(slot => {
      if (slot.label === label) {
        return { ...slot, feedback: text };
      }
      return slot;
    }));
  };

  // Calculate overall accumulated score
  const getOverallScore = () => {
    return slots.reduce((acc, s) => acc + (s.finalScore || 0), 0);
  };

  // Derived real-time dashboard summary stats
  const totalSectionScore = slots.reduce((acc, s) => acc + (s.finalScore || 0), 0);
  const manualOverrideCount = slots.filter(s => s.hasSheet && s.manualScore !== null).length;
  const aiContributionCount = slots.filter(s => s.hasSheet && s.manualScore === null && s.aiScore !== null).length;

  // AI processing caller
  const runAISimulation = async () => {
    if (!submission) return;

    // Cegah double submit (Requirement 8)
    const currentStatus = submission.ai_status || submission.status_submit;
    if (
      !isBackendOffline && (
        currentStatus === 'processing' ||
        currentStatus === 'ai_pending' ||
        currentStatus === 'ai_running' ||
        isPredicting
      )
    ) {
      return;
    }

    setIsPredicting(true);
    setAiErrorMessage(null);
    setShowSuccessBanner(false);

    // 11. CLEAR FRONTEND PREDICTION STATE
    setTotalAIScore(null);
    setSlots(prev => prev.map(s => ({
      ...s,
      aiScore: null,
      confidence: null,
      finalScore: s.manualScore !== null ? s.manualScore : null,
      manualCorrection: 0
    })));

    // Optimistically update local state so the UI updates immediately
    setSubmission(prev => prev ? {
      ...prev,
      ai_status: 'processing',
      status_submit: 'processing_ai',
      model_ai: selectedModel,
      nilai_akhir: null
    } : null);

    try {
      // Call actual backend AI endpoint
      const res = await apiPost(`/predict/${submission.id}?model=${selectedModel}`);

      if (!res.ok) {
        let errorDetail = 'Gagal memulai proses prediksi.';
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) {
            errorDetail = errJson.detail;
          }
        } catch { }
        throw new Error(errorDetail);
      }

      const queuedJob = await res.json() as {
        job_id: string;
        accepted_ids: string[];
      };
      if (!queuedJob.job_id || !queuedJob.accepted_ids.includes(submission.id)) {
        throw new Error('Submission tidak diterima oleh antrean AI.');
      }
      sessionStorage.setItem(
        `emathtoco:ai-job:${submission.id}`,
        queuedJob.job_id,
      );
      setActiveJobId(queuedJob.job_id);
      setIsBackendOffline(false);
    } catch (err: unknown) {

      const isConnectionError = err instanceof TypeError
        || (err instanceof Error && err.message.includes('fetch'));
      if (isConnectionError) {
        setIsBackendOffline(true);
      }

      let errorToastTitle = 'Gagal';
      let errorToastMsg = 'Gagal memulai proses prediksi.';

      if (isConnectionError) {
        errorToastTitle = 'Koneksi Gagal';
        errorToastMsg = 'Backend AI tidak dapat dihubungi.';
      } else if (err instanceof Error && err.message) {
        errorToastMsg = err.message;
      }

      setAiErrorMessage(errorToastMsg);
      // Restore submission status so button is not stuck in processing if backend failed
      setSubmission(prev => prev ? {
        ...prev,
        ai_status: 'failed',
        status_submit: 'failed',
        nilai_akhir: null
      } : null);
      toast.error(errorToastTitle, errorToastMsg);
    } finally {
      setIsPredicting(false);
    }
  };

  // Finalize Submission logic
  const finalizeAssessment = async () => {
    if (!submission) return;
    // Show the inline confirm modal instead of window.confirm
    setShowConfirmModal(true);
  };

  const doFinalize = async () => {
    setShowConfirmModal(false);
    if (!submission || isFinalizing) return;

    setIsFinalizing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const reviewPayload = buildReviewPayload(slots);
      await finalizeSubmissionReview(
        submission.id,
        reviewPayload,
        selectedModel,
      );

      setSuccessMsg('Penilaian tugas berhasil difinalisasi!');
      toast.success('Finalisasi Berhasil', 'Nilai pengumpulan tugas telah dikunci secara permanen.');
      loadWorkspaceDetails();
    } catch (err) {
      logger.error('Error finalizing assessment:', err);
      setErrorMsg('Gagal menyelesaikan proses finalisasi nilai.');
      toast.error('Finalisasi Gagal', 'Terjadi kesalahan saat mengunci nilai.');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Handle reupload request for a specific section
  const openReuploadModal = (slotLabel: string) => {
    if (isAIProcessing) {
      toast.info('Review Dikunci', 'AI sedang memproses jawaban. Tunggu sampai proses selesai.');
      return;
    }
    setReuploadTargetSlot(slotLabel);
    setReuploadReason('');
    setShowReuploadModal(true);
  };

  const handleRequestReupload = async () => {
    if (
      !submission
      || !reuploadTargetSlot
      || !reuploadReason.trim()
      || isRequestingReupload
      || isAIProcessing
    ) return;

    const targetSlot = slots.find(s => s.label === reuploadTargetSlot);
    if (!targetSlot?.sheetId) return;

    setIsRequestingReupload(true);
    try {
      await requestAnswerReupload(
        submission.id,
        reuploadTargetSlot,
        reuploadReason,
      );

      toast.success('Reupload Diminta', `Section ${reuploadTargetSlot.toUpperCase()} ditandai untuk upload ulang.`);
      setShowReuploadModal(false);
      loadWorkspaceDetails();
    } catch (err) {
      logger.error('Error requesting reupload:', err);
      toast.error('Gagal', 'Tidak dapat menandai section untuk upload ulang.');
    } finally {
      setIsRequestingReupload(false);
    }
  };

  // Status Chip Config
  const getStatusBadge = (aiStatus: string | null | undefined) => {
    const status = aiStatus || 'pending';
    switch (status) {
      case 'pending':
        return { icon: '⏳', text: 'Menunggu AI', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
      case 'processing':
        return { icon: '🤖', text: 'Diproses AI', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' };
      case 'completed':
        return { icon: '👨‍🏫', text: 'Siap Direview', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
      case 'reviewed':
        return { icon: '👨‍🏫', text: 'Direview Dosen', color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' };
      case 'finalized':
        return { icon: '🏁', text: 'Finalized', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
      case 'failed':
        return { icon: '❌', text: 'Gagal', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' };
      case 'offline':
        return { icon: '🔌', text: 'Backend Offline', color: 'text-red-400 dark:text-red-400', bg: 'bg-red-500/15', border: 'border-red-500/30' };
      default:
        return { icon: '⏳', text: 'Menunggu AI', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
    }
  };

  const isReadOnly = submission?.ai_status === 'finalized' || submission?.status_submit === 'finalized';

  const isProcessing = isPredicting || (isAIActive && !isBackendOffline);
  const submissionStatus = submission?.status_submit;
  const aiStatus = submission?.ai_status;
  const disabledReason = isReadOnly
    ? "submission_finalized"
    : isPredicting
      ? "request_in_flight"
      : (isAIActive && !isBackendOffline)
        ? "ai_processing"
        : "none";

  const performAutoSave = useCallback(async () => {
    const currentSubmission = submissionRef.current;
    if (!currentSubmission || !autoSaveReadyRef.current) return;

    const aiStillRunning =
      currentSubmission.status_submit === 'processing_ai' ||
      currentSubmission.ai_status === 'processing' ||
      currentSubmission.ai_status === 'ai_pending' ||
      currentSubmission.ai_status === 'ai_running' ||
      isPredictingRef.current;

    if (
      currentSubmission.status_submit === 'finalized' ||
      currentSubmission.ai_status === 'finalized' ||
      aiStillRunning
    ) {
      return;
    }

    if (isSavingRef.current) {
      pendingAutoSaveRef.current = true;
      return;
    }

    const signature = buildReviewSignature(slotsRef.current, selectedModelRef.current);
    if (signature === lastSavedReviewSignatureRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);
    setAutoSaveStatus('saving');
    setAutoSaveMessage('Menyimpan perubahan otomatis...');
    setErrorMsg(null);

    try {
      const reviewPayload = buildReviewPayload(slotsRef.current);
      await saveSubmissionReview(
        currentSubmission.id,
        reviewPayload,
        selectedModelRef.current,
      );

      lastSavedReviewSignatureRef.current = signature;
      setAutoSaveStatus('saved');
      setAutoSaveMessage(`Tersimpan otomatis ${new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })}.`);
    } catch (err) {
      logger.error('Error auto-saving review draft:', err);
      setAutoSaveStatus('error');
      setAutoSaveMessage('Autosave gagal. Perubahan tetap di layar; periksa koneksi lalu ubah lagi untuk mencoba ulang.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);

      if (pendingAutoSaveRef.current) {
        pendingAutoSaveRef.current = false;
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
        }
        autoSaveTimerRef.current = setTimeout(() => {
          void performAutoSave();
        }, 600);
      }
    }
  }, []);

  useEffect(() => {
    if (
      !submission ||
      !autoSaveReadyRef.current ||
      isLoadingWorkspace ||
      isReadOnly ||
      isAIProcessing
    ) {
      return;
    }

    const signature = buildReviewSignature(slots, selectedModel);
    if (signature === lastSavedReviewSignatureRef.current) return;

    setAutoSaveStatus('dirty');
    setAutoSaveMessage('Ada perubahan belum tersimpan. Autosave akan berjalan sebentar lagi.');

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      void performAutoSave();
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    slots,
    selectedModel,
    submission,
    isLoadingWorkspace,
    isReadOnly,
    isAIProcessing,
    performAutoSave,
  ]);

  const questionSectionsByNumber = React.useMemo(
    () => questionSet ? groupSectionsByQuestion(questionSet.sections) : new Map<number, QuestionSection[]>(),
    [questionSet],
  );

  const questionSectionsByCode = React.useMemo(() => {
    const mapped = new Map<string, QuestionSection>();
    questionSet?.sections.forEach((section) => mapped.set(section.section_code, section));
    return mapped;
  }, [questionSet]);

  logger.debug(
    "AI Button State:",
    {
      isProcessing,
      submissionStatus,
      aiStatus,
      disabledReason
    }
  );

  if (isChecking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
          <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memverifikasi otoritas dosen...</p>
        </div>
      </div>
    );
  }
  if (isAccessDenied) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans pb-16 relative overflow-hidden flex flex-col">
          <Navbar showBack backUrl={courseId ? `/dosen/course/${courseId}` : "/dosen"} title="Akses Ditolak" />
          <main className="flex-grow flex items-center justify-center">
            <div className="text-center max-w-md mx-auto px-6 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Akses Ditolak</h1>
              <p className="text-slate-500 dark:text-neutral-400 text-sm">Anda tidak ditugaskan ke mata kuliah dari pengumpulan tugas ini. Silakan hubungi administrator.</p>
              <button
                onClick={() => router.push(courseId ? `/dosen/course/${courseId}` : "/dosen")}
                className="mt-4 px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white cursor-pointer transition-all hover:from-cyan-400 hover:to-blue-500"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </main>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-slate-50 dark:bg-gradient-to-br dark:from-[#060814] dark:via-[#020205] dark:to-[#000000] text-slate-700 dark:text-neutral-300 font-sans pb-24 relative flex flex-col">
        <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* Inline Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-amber-500/30 rounded-2xl max-w-md w-full shadow-[0_0_40px_rgba(245,158,11,0.08)] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Finalisasi Penilaian</h3>
                <p className="text-xs text-slate-500 dark:text-neutral-500 mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>
            <p className="text-sm text-slate-700 dark:text-neutral-300 leading-relaxed mb-6">
              Apakah Anda yakin ingin memfinalisasi nilai pengumpulan tugas ini?{' '}
              <span className="text-amber-600 dark:text-amber-400 font-semibold">Seluruh perubahan nilai akan dikunci secara permanen.</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-100/50 text-slate-700 hover:bg-slate-200 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-all cursor-pointer"
              >
                Batalkan
              </button>
              <button
                onClick={doFinalize}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold transition-all shadow-lg shadow-amber-500/15 cursor-pointer"
              >
                Ya, Finalisasi Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reupload Request Modal */}
      {showReuploadModal && reuploadTargetSlot && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 dark:bg-[#0A0A0F] dark:border-amber-500/30 rounded-2xl max-w-md w-full shadow-[0_0_40px_rgba(245,158,11,0.08)] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <RotateCcw className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Request Reupload</h3>
                <p className="text-xs text-slate-500 dark:text-neutral-500 mt-0.5">
                  Section <span className="text-amber-600 dark:text-amber-400 font-mono font-bold">{reuploadTargetSlot.toUpperCase()}</span> — Mahasiswa harus upload ulang
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider mb-2">
                Alasan Upload Ulang
              </label>
              <textarea
                value={reuploadReason}
                onChange={(e) => setReuploadReason(e.target.value)}
                placeholder="Contoh: Gambar blur, jawaban tidak sesuai, halaman salah, file rusak..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-800 hover:border-slate-300 dark:hover:border-neutral-700 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 rounded-xl p-3 text-slate-800 dark:text-neutral-200 text-sm focus:outline-none resize-none placeholder:text-slate-400 dark:placeholder:text-neutral-600"
              />
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 mb-5">
              <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed">
                ⚠ Section ini akan ditandai untuk upload ulang. Nilai AI dan nilai manual akan direset.
                Mahasiswa dapat mengunggah file baru pada section ini.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowReuploadModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-100/50 text-slate-700 hover:bg-slate-200 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-all cursor-pointer"
              >
                Batalkan
              </button>
              <button
                onClick={handleRequestReupload}
                disabled={!reuploadReason.trim() || isRequestingReupload}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold transition-all shadow-lg shadow-amber-500/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isRequestingReupload ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Request Reupload
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-cyan-500/5 dark:bg-cyan-500/8 rounded-full blur-[120px] animate-float-blue"></div>
        <div className="absolute bottom-[15%] right-[15%] w-[500px] h-[500px] bg-indigo-500/5 dark:bg-indigo-500/8 rounded-full blur-[130px] animate-float-purple"></div>
      </div>

      <Navbar
        showBack
        backUrl={courseId ? `/dosen/course/${courseId}` : "/dosen"}
        title="Workspace Review Dosen"
        subtitle={
          Array.isArray(submission?.mahasiswa)
            ? submission?.mahasiswa[0]?.nama_lengkap
            : submission?.mahasiswa?.nama_lengkap || ''
        }
      />

      {isLoadingWorkspace ? (
        <div className="flex-grow flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-10 h-10 text-cyan-500 dark:text-cyan-400 animate-spin" />
          <p className="text-slate-500 dark:text-neutral-400 text-sm animate-pulse">Memuat workspace lembar jawaban...</p>
        </div>
      ) : errorMsg && !submission ? (
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 p-5 rounded-2xl">
            <p className="font-semibold">{errorMsg}</p>
            <button onClick={() => router.push(courseId ? `/dosen/course/${courseId}` : "/dosen")} className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800 dark:border-transparent rounded-xl text-sm font-bold transition-all cursor-pointer">Kembali ke Dashboard</button>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 w-full flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* LEFT COLUMN: 24-GRID REVIEW LIST */}
          <div className="lg:col-span-2 space-y-8 order-2 lg:order-1">
            {/* Notifications */}
            {errorMsg && (
              <div className="flex items-start gap-3 bg-red-950/20 border border-red-900/50 text-red-400 p-4 rounded-xl text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="font-medium leading-relaxed">{errorMsg}</p>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-3 bg-emerald-950/20 border border-emerald-900/50 text-emerald-400 p-4 rounded-xl text-sm">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="font-medium leading-relaxed">{successMsg}</p>
              </div>
            )}
            {questionSetError && (
              <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-900/50 text-amber-400 p-4 rounded-xl text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="font-medium leading-relaxed">{questionSetError}</p>
              </div>
            )}
            {!questionSet && !questionSetError && (
              <div className="bg-slate-100/80 border border-slate-300 dark:bg-neutral-950/40 dark:border-neutral-900 rounded-2xl p-4 text-xs text-slate-600 dark:text-neutral-400 leading-relaxed">
                Belum ada paket soal published untuk mata kuliah ini. Review tetap berjalan, tetapi panel soal tidak ditampilkan.
              </div>
            )}
            {questionSet && (
              <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4 text-xs text-cyan-700 dark:text-cyan-300 leading-relaxed">
                <span className="font-bold uppercase tracking-wider">Bank Soal Aktif:</span> {questionSet.title}. {FIXED_SECTION_LABEL}
              </div>
            )}

            <div className="space-y-6">
              {[1, 2, 3, 4].map(numSoal => {
                const questionSlots = slots.filter(s => s.nomor_soal === numSoal);
                const groupQuestions = questionSectionsByNumber.get(numSoal) ?? [];
                const parentPrompt = groupQuestions[0]?.parent_prompt;
                return (
                  <div key={numSoal} className="bg-white dark:bg-[#0A0A0F]/70 border border-slate-300 dark:border-neutral-900 rounded-2xl p-6 backdrop-blur-md space-y-4">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-neutral-300 tracking-widest border-b border-slate-200 dark:border-neutral-900/60 pb-2 uppercase">
                      Kumpulan Soal {numSoal}
                    </h3>
                    {parentPrompt && (
                      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                        <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-400 mb-2">
                          Soal Induk
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-neutral-300 font-mono">
                          {parentPrompt}
                        </pre>
                      </div>
                    )}

                    <div className="space-y-6">
                      {questionSlots.map(slot => {
                        const sectionCode = `S-${slot.label.toUpperCase()}`;
                        const sectionQuestion = questionSectionsByCode.get(sectionCode);
                        return (
                        <div
                          key={slot.label}
                          className={`border rounded-2xl pt-14 pb-6 px-6 transition-all duration-300 relative flex flex-col gap-6 ${slot.dbStatus === 'reupload_required'
                            ? 'bg-amber-500/5 dark:bg-amber-950/10 border-amber-500/30 border-dashed'
                            : slot.hasSheet
                              ? 'bg-slate-50/70 dark:bg-[#0D0D14]/85 border-slate-300 dark:border-neutral-900/80 hover:border-cyan-500/30'
                              : 'bg-slate-100/50 border-slate-300 dark:bg-neutral-950/20 dark:border-neutral-950 opacity-40 select-none'
                            }`}
                        >
                          {/* Label Section Code */}
                          <div className="absolute top-4 left-6 flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${slot.dbStatus === 'reupload_required'
                              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400'
                              : 'bg-slate-100 dark:bg-neutral-950 border border-slate-300 dark:border-neutral-900 text-slate-700 dark:text-neutral-400'
                              }`}>
                              {slot.dbStatus === 'reupload_required' ? '⚠ ' : ''}Bagian {slot.label.toUpperCase()}
                            </span>
                            {slot.wasReuploaded && slot.dbStatus !== 'reupload_required' && (
                              <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                                ✅ REUPLOADED
                              </span>
                            )}
                          </div>

                          {/* Top Row: Question Details & Answer Image side by side */}
                          <div className="flex flex-col lg:flex-row gap-6 w-full">
                            {/* Question Details */}
                            {sectionQuestion ? (
                              <div className="w-full lg:w-[65%] bg-white/80 border border-slate-200 dark:bg-black/35 dark:border-neutral-900 rounded-xl p-4 space-y-2">
                                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-cyan-700 dark:text-cyan-400">
                                  Soal {slot.label.toUpperCase()}
                                </div>
                                <p className="text-xs leading-relaxed text-slate-700 dark:text-neutral-300">
                                  {sectionQuestion.question_text}
                                </p>
                                {sectionQuestion.helper_text && (
                                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-900 p-2.5 text-[11px] leading-relaxed text-slate-600 dark:text-neutral-400 font-mono">
                                    {sectionQuestion.helper_text}
                                  </pre>
                                )}
                                {sectionQuestion.assets.length > 0 && (
                                  <div className="grid grid-cols-2 gap-2 mt-2">
                                    {sectionQuestion.assets.map((asset) => (
                                      <button
                                        key={asset.id}
                                        type="button"
                                        onClick={() => {
                                          if (!asset.signedUrl) return;
                                          setModalImageUrl(asset.signedUrl);
                                          setModalTitle(`Gambar Soal ${slot.label.toUpperCase()}`);
                                        }}
                                        className="overflow-hidden rounded-lg border border-slate-205 dark:border-neutral-900 bg-slate-50 dark:bg-black hover:border-cyan-500/40 transition-colors cursor-pointer disabled:cursor-not-allowed"
                                        disabled={!asset.signedUrl}
                                      >
                                        {asset.signedUrl ? (
                                          <img
                                            src={asset.signedUrl}
                                            alt={asset.caption || `Gambar soal ${slot.label.toUpperCase()}`}
                                            className="w-full max-h-24 object-contain"
                                            loading="lazy"
                                            decoding="async"
                                            fetchPriority="low"
                                          />
                                        ) : (
                                          <span className="block p-2 text-[9px] text-slate-500 dark:text-neutral-500">
                                            Gambar tidak dapat dimuat.
                                          </span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null}

                            {/* Answer Sheet Preview */}
                            <div className={`w-full ${sectionQuestion ? 'lg:w-[35%]' : 'w-full'} flex flex-col gap-2`}>
                              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500 dark:text-neutral-400">
                                Lembar Jawaban
                              </div>
                              <div className="w-full h-44 bg-slate-50 dark:bg-black border border-slate-300 dark:border-neutral-900/80 rounded-xl overflow-hidden relative flex items-center justify-center">
                                {slot.hasSheet && slot.fileUrl ? (
                                  <div className="group/card w-full h-full relative cursor-pointer" onClick={() => {
                                    setModalImageUrl(slot.fileUrl);
                                    setModalTitle(`Section ${slot.label.toUpperCase()}`);
                                  }}>
                                    <img
                                      src={slot.fileUrl}
                                      alt={`Slot ${slot.label}`}
                                      loading="lazy"
                                      decoding="async"
                                      fetchPriority="low"
                                      className="w-full h-full object-contain opacity-90 group-hover/card:opacity-100 transition-opacity duration-300 p-2"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 flex items-center justify-center transition-all">
                                      <Eye className="w-5 h-5 text-white" />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center gap-1.5 opacity-55">
                                    <Lock className="w-5 h-5 text-slate-500 dark:text-neutral-600" />
                                    <span className="text-[9px] font-mono text-slate-500 dark:text-neutral-600 uppercase tracking-wider">Locked</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Bottom Row: Inputs, final score, feedback */}
                          {slot.hasSheet ? (
                            <div className="w-full bg-slate-100/40 dark:bg-neutral-950/20 border border-slate-200 dark:border-neutral-900/60 rounded-xl p-4 mt-2">
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                {/* Left parameters: Hasil AI & Nilai Manual */}
                                <div className="md:col-span-4 space-y-4">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-700 dark:text-neutral-400 uppercase tracking-wider mb-1">Hasil AI</label>
                                    <div className="w-full bg-slate-100 border border-slate-250 dark:bg-[#0A0A0F]/60 dark:border-neutral-900 rounded-xl py-2 px-3 text-slate-800 dark:text-neutral-300 text-xs font-mono leading-normal space-y-1">
                                      <div className="flex justify-between">
                                        <span>Nilai AI:</span>
                                        <span className="font-extrabold text-cyan-600 dark:text-cyan-400">{isAIProcessing ? '⏳' : (slot.aiScore !== null ? slot.aiScore : '-')}</span>
                                      </div>
                                      <div className="flex justify-between border-t border-slate-200 dark:border-neutral-900/40 pt-1">
                                        <span>Confidence:</span>
                                        <span className="font-bold text-slate-600 dark:text-neutral-400">{isAIProcessing ? '⏳' : (slot.confidence !== null ? `${Math.round(slot.confidence * 100)}%` : '-')}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-700 dark:text-neutral-400 uppercase tracking-wider mb-1">Nilai Manual</label>
                                    <input
                                      type="number"
                                      placeholder="Belum diatur"
                                      value={slot.manualScore !== null ? slot.manualScore : ''}
                                      onChange={(e) => handleManualScoreChange(slot.label, e.target.value)}
                                      disabled={isReadOnly || isAIProcessing}
                                      className="w-full bg-slate-50 border border-slate-300 dark:bg-black dark:border-neutral-900 hover:border-slate-400 dark:hover:border-neutral-800 focus:border-cyan-500 dark:focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/10 rounded-xl py-2 px-3 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-600 text-sm font-mono focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-[10px] text-slate-500 dark:text-neutral-500 mt-1 block">
                                      Maksimal nilai: {slot.label.toLowerCase().endsWith('f') ? '5' : '4'}
                                    </span>
                                  </div>
                                </div>

                                {/* Center final score */}
                                <div className="md:col-span-3 flex flex-col justify-between">
                                  <div>
                                    <label className="block text-[10px] font-bold text-cyan-800 dark:text-cyan-400 uppercase tracking-wider mb-1">Nilai Akhir Bagian</label>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={slot.finalScore !== null ? slot.finalScore : ''}
                                      onChange={(e) => handleFinalScoreChange(slot.label, e.target.value)}
                                      disabled={isReadOnly || isAIProcessing}
                                      className="w-full bg-slate-50 border border-cyan-500/50 hover:border-cyan-600 dark:bg-black dark:border-cyan-500/20 dark:hover:border-cyan-500/40 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 rounded-xl py-2 px-3 text-cyan-800 dark:text-cyan-400 text-base font-mono font-extrabold focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-[10px] text-slate-500 dark:text-neutral-500 mt-1 block">
                                      Maksimal nilai: {slot.label.toLowerCase().endsWith('f') ? '5' : '4'}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 dark:text-neutral-500 leading-normal hidden md:inline-block">
                                    *Nilai ini akan disimpan sebagai skor final bagian.
                                  </span>
                                </div>

                                {/* Right Feedback + Reupload */}
                                <div className="md:col-span-5 flex flex-col justify-between h-full">
                                  <div className="flex-grow flex flex-col">
                                    <label className="block text-[10px] font-bold text-slate-700 dark:text-neutral-400 uppercase tracking-wider mb-1">Feedback Dosen</label>
                                    <textarea
                                      placeholder="Tulis koreksi atau arahan..."
                                      value={slot.feedback}
                                      onChange={(e) => handleFeedbackChange(slot.label, e.target.value)}
                                      disabled={isReadOnly || slot.dbStatus === 'reupload_required' || isAIProcessing}
                                      rows={3}
                                      className="w-full bg-slate-50 border border-slate-300 dark:bg-black dark:border-neutral-900 hover:border-slate-400 dark:hover:border-neutral-800 text-slate-800 dark:text-neutral-200 placeholder:text-slate-400 dark:placeholder:text-neutral-600 text-xs focus:outline-none resize-none flex-grow rounded-xl p-3 disabled:opacity-40 disabled:cursor-not-allowed"
                                    />
                                  </div>

                                  <div className="mt-2.5">
                                    {/* Reupload Request Button */}
                                    {!isReadOnly && slot.dbStatus !== 'reupload_required' && (
                                      <button
                                        onClick={() => openReuploadModal(slot.label)}
                                        disabled={isAIProcessing}
                                        className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400/80 hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Request Reupload
                                      </button>
                                    )}

                                    {/* Rejection indicator for already-rejected sections */}
                                    {slot.dbStatus === 'reupload_required' && (
                                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
                                        <p className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-wider mb-1">⚠ Upload Ulang Diminta</p>
                                        {slot.rejectionReason && (
                                          <p className="text-xs text-amber-300/80 leading-relaxed">&ldquo;{slot.rejectionReason}&rdquo;</p>
                                        )}
                                      </div>
                                    )}

                                    {/* Catat reupload sebelumnya */}
                                    {slot.wasReuploaded && slot.rejectionReason && slot.dbStatus !== 'reupload_required' && (
                                      <div className="bg-slate-100 border border-slate-250 dark:bg-neutral-900 dark:border-neutral-800 rounded-lg p-2.5">
                                        <p className="text-[10px] font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-wider mb-1">Catatan Reupload Sebelumnya</p>
                                        <p className="text-xs text-slate-600 dark:text-neutral-400 leading-relaxed">&ldquo;{slot.rejectionReason}&rdquo;</p>
                                        {slot.lastReuploadAt && (
                                          <p className="text-[9px] text-slate-400 dark:text-neutral-500 font-mono mt-1.5">
                                            Reuploaded: {new Date(slot.lastReuploadAt).toLocaleString('id-ID', {
                                              day: 'numeric',
                                              month: 'short',
                                              year: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit'
                                            })}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="w-full bg-slate-100/40 dark:bg-neutral-950/20 border border-slate-200 dark:border-neutral-900/60 rounded-xl p-4 mt-2 flex items-center justify-center">
                              <span className="text-xs text-slate-400 dark:text-neutral-500 italic">Mahasiswa belum mengunggah lembar jawaban pada bagian ini.</span>
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN: ASSESSMENT INFO & CONTROLS */}
          <div className="order-1 lg:order-2 space-y-6 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto pr-2">

            {/* Student Info Card */}
            <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

              <h3 className="text-xs font-bold text-slate-600 dark:text-neutral-400 uppercase tracking-widest mb-4">Informasi Mahasiswa</h3>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block">Nama Lengkap</span>
                  <span className="text-lg font-bold text-slate-800 dark:text-white">{Array.isArray(submission?.mahasiswa) ? submission?.mahasiswa[0]?.nama_lengkap : submission?.mahasiswa?.nama_lengkap || 'Unknown'}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block">NIM</span>
                    <span className="text-sm font-mono text-slate-700 dark:text-neutral-300">{Array.isArray(submission?.mahasiswa) ? submission?.mahasiswa[0]?.nim_nip : submission?.mahasiswa?.nim_nip || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block">Kelas</span>
                    <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">{Array.isArray(submission?.mahasiswa) ? submission?.mahasiswa[0]?.kelas : submission?.mahasiswa?.kelas || '-'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block">Mata Kuliah</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-neutral-300">{Array.isArray(submission?.mata_kuliah) ? submission?.mata_kuliah[0]?.nama_matkul : submission?.mata_kuliah?.nama_matkul || '-'}</span>
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-mono block mt-0.5 uppercase">{Array.isArray(submission?.mata_kuliah) ? submission?.mata_kuliah[0]?.kode_matkul : submission?.mata_kuliah?.kode_matkul || ''}</span>
                </div>

                <div className="border-t border-slate-100 dark:border-neutral-900 pt-3 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block">Status Submit</span>
                    {submission && (() => {
                      const badge = getStatusBadge(isBackendOffline ? 'offline' : (submission.ai_status || submission.status_submit));
                      return (
                        <span className={`inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${badge.bg} ${badge.border} ${badge.color}`}>
                          {badge.icon} {badge.text}
                        </span>
                      );
                    })()}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block text-right">Waktu Submit</span>
                    <span className="text-[10px] text-slate-600 dark:text-neutral-400 font-medium block mt-1 text-right">
                      {submission?.waktu_submit ? new Date(submission.waktu_submit).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI pipeline integration controls */}
            {submission && (
              <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 backdrop-blur-md space-y-5">
                <div>
                  <h3 className="text-xs font-bold text-slate-600 dark:text-neutral-400 uppercase tracking-widest block mb-1">Model AI Penilaian</h3>
                  <p className="text-[10px] text-slate-500 dark:text-neutral-400 mb-3">Pilih arsitektur jaringan saraf dalam untuk melakukan penilaian.</p>

                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isReadOnly || isAIProcessing}
                    className={`w-full bg-slate-50 border border-slate-200 dark:bg-black dark:border-neutral-900 hover:border-slate-300 dark:hover:border-neutral-800 text-slate-700 dark:text-neutral-300 rounded-xl p-3 text-sm focus:outline-none cursor-pointer ${(isReadOnly || isAIProcessing) ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <option value="MobileNetV2">MobileNetV2 (Ringan & Cepat)</option>
                    <option value="DenseNet121">DenseNet121</option>
                    <option value="InceptionV3">InceptionV3 (Deteksi Pola Komparatif)</option>
                  </select>
                </div>

                {/* Status Panels (placed right above the button) */}
                {(isAIProcessing || showSuccessBanner || aiErrorMessage) && (
                  <div className="space-y-3">
                    {/* 1. Loading Panel */}
                    {isAIProcessing && (
                      <div className="bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                        <Loader2 className="w-5 h-5 text-purple-600 dark:text-purple-400 animate-spin flex-shrink-0" />
                        <div className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                          🤖 {submission?.model_ai || selectedModel} sedang menganalisis jawaban mahasiswa. Model sedang memproses jawaban...
                        </div>
                      </div>
                    )}

                    {/* 2. Success Panel */}
                    {showSuccessBanner && (
                      <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-250 dark:border-emerald-900/50 rounded-xl p-4 flex items-start gap-3">
                        <span className="text-lg flex-shrink-0">✅</span>
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-400">Prediksi selesai</div>
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-500">
                            {aiSuccessModel} berhasil menyelesaikan penilaian
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. Error Panel */}
                    {aiErrorMessage && (
                      <div className="bg-red-50/60 dark:bg-red-950/20 border border-red-250 dark:border-red-900/50 rounded-xl p-4 flex items-start gap-3">
                        <span className="text-lg flex-shrink-0">❌</span>
                        <div className="space-y-0.5 flex-grow">
                          <div className="text-xs font-bold text-red-800 dark:text-red-400">Prediksi gagal</div>
                          <div className="text-[11px] text-red-700 dark:text-red-500">
                            {aiErrorMessage}
                          </div>
                        </div>
                        <button
                          onClick={() => setAiErrorMessage(null)}
                          className="text-slate-400 dark:text-neutral-500 hover:text-slate-700 dark:hover:text-white transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={runAISimulation}
                  disabled={isAIProcessing || isReadOnly}
                  className={`w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-600 hover:via-blue-600 hover:to-indigo-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/10 text-sm tracking-widest cursor-pointer active:scale-[0.99] ${(isAIProcessing || isReadOnly) ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {isPredicting || isAIProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Play className="w-4 h-4 fill-white" />
                  )}
                  <span>
                    {isPredicting
                      ? 'Memulai Prediksi...'
                      : isAIProcessing
                        ? 'Model sedang memproses jawaban...'
                        : 'PROSES DENGAN AI'}
                  </span>
                </button>
              </div>
            )}

            {/* Final Score Summary Panel */}
            <div className="bg-white dark:bg-[#0A0A0F]/80 border border-slate-200 dark:border-neutral-900 rounded-2xl p-6 backdrop-blur-md relative overflow-hidden shadow-2xl space-y-4">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

              <h3 className="text-xs font-bold text-slate-600 dark:text-neutral-400 uppercase tracking-widest flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-cyan-500 dark:text-cyan-400" /> Ringkasan Nilai Akhir
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2.5 sm:gap-4">
                  <div className="bg-slate-50 border border-slate-200 dark:bg-black/45 dark:border-neutral-900 rounded-xl p-2.5 sm:p-3">
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block mb-0.5">Skor Bagian</span>
                    <span className="text-2xl font-extrabold text-slate-800 dark:text-white font-mono">{totalSectionScore}</span>
                    <span className="text-[9px] text-slate-500 dark:text-neutral-500 font-mono block mt-0.5">/ 100</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 dark:bg-black/45 dark:border-neutral-900 rounded-xl p-2.5 sm:p-3">
                    <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider block mb-0.5">Total Nilai AI</span>
                    <span className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 font-mono">{isAIProcessing ? '⏳' : (totalAIScore !== null ? totalAIScore : '-')}</span>
                    <span className="text-[9px] text-purple-600/80 dark:text-purple-500/60 font-mono block mt-0.5">AI Engine</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 dark:bg-black/45 dark:border-neutral-900 rounded-xl p-2.5 sm:p-3">
                    <span className="text-[10px] text-slate-500 dark:text-neutral-400 font-bold uppercase tracking-wider block mb-0.5">Nilai Resmi</span>
                    <span className="text-2xl font-extrabold text-cyan-600 dark:text-cyan-400 font-mono">{totalSectionScore}</span>
                    <span className="text-[9px] text-cyan-700/80 dark:text-cyan-500/60 font-mono block mt-0.5">Official</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 dark:border-neutral-900/60 pt-3 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 dark:text-neutral-400 font-medium">Model Aktif:</span>
                    <span className="font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                      {submission?.model_ai || selectedModel}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 dark:text-neutral-400 font-medium">Kontribusi AI</span>
                    <span className="font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                      {aiContributionCount} / 24 Bagian
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 dark:text-neutral-400 font-medium">Override Manual Dosen</span>
                    <span className="font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                      {manualOverrideCount} / 24 Bagian
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall Grading Dashboard Summary Card */}
            <div className="bg-white dark:bg-gradient-to-b dark:from-[#0F1424] dark:to-[#060814] border border-slate-200 dark:border-cyan-500/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

              <div>
                <span className="text-xs font-bold text-slate-600 dark:text-neutral-400 uppercase tracking-widest block mb-1">Nilai Akhir Tugas</span>
                <p className="text-[10px] text-slate-500 dark:text-neutral-400 mb-4">Nilai kumulatif dari seluruh halaman lembar jawaban.</p>

                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-5xl font-extrabold text-cyan-600 dark:text-cyan-400 font-mono">{getOverallScore()}</span>
                  <span className="text-sm font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-wider font-mono">/ 100</span>
                </div>
              </div>

              {!isReadOnly ? (
                <div className="space-y-3">
                  <div className={`rounded-xl border p-3 text-xs leading-relaxed ${
                    isAIProcessing
                      ? 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950/20 dark:border-purple-900/50 dark:text-purple-200'
                      : autoSaveStatus === 'error'
                        ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-200'
                        : autoSaveStatus === 'dirty'
                          ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900/50 dark:text-amber-200'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/50 dark:text-emerald-200'
                  }`}>
                    <div className="flex items-start gap-2">
                      {isSaving || autoSaveStatus === 'saving' ? (
                        <Loader2 className="w-4 h-4 animate-spin mt-0.5 flex-shrink-0" />
                      ) : autoSaveStatus === 'error' ? (
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      ) : (
                        <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-extrabold uppercase tracking-wider">
                          {isAIProcessing ? 'Review Dikunci Sementara' : 'Autosave Review'}
                        </p>
                        <p className="mt-0.5">
                          {isAIProcessing
                            ? 'AI sedang memproses jawaban. Nilai dan feedback tidak dapat diubah sampai proses selesai.'
                            : autoSaveMessage}
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={finalizeAssessment}
                    disabled={isFinalizing || isSaving || isAIProcessing}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-700 text-white font-extrabold py-3.5 px-4 rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/10 text-xs tracking-widest cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isFinalizing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <span>🏁 FINALISASI NILAI</span>
                    )}
                  </button>
                </div>
              ) : (
                <div className="border border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5 p-4 rounded-xl text-center">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest block">🏁 Penilaian Telah Final</span>
                  <span className="text-[10px] text-slate-500 dark:text-neutral-400 mt-1 block">Nilai akhir telah dikunci secara permanen dan dipublikasikan ke mahasiswa.</span>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

      {/* FULLSIZE IMAGE PREVIEW MODAL */}
      {modalImageUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={() => setModalImageUrl(null)}>
          <div className="relative max-w-4xl max-h-[90vh] bg-white border border-slate-250 dark:bg-[#0A0A0F] dark:border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-neutral-900">
              <span className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{modalTitle}</span>
              <button onClick={() => setModalImageUrl(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-neutral-900 rounded-lg transition-colors cursor-pointer">
                <X className="w-5 h-5 text-slate-400 dark:text-neutral-400" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center">
              <img
                src={modalImageUrl}
                alt="Full Size Preview"
                decoding="async"
                className="max-w-full max-h-[70vh] rounded-xl object-contain border border-slate-200 dark:border-neutral-900 shadow-md"
              />
            </div>
          </div>
        </div>
      )}

    </div>
    </PageTransition>
  );
}
