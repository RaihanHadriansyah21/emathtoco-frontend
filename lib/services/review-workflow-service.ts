import { supabase } from '@/lib/supabase';

export interface ReviewSlotInput {
  label: string;
  hasSheet: boolean;
  sheetId?: string;
  manualScore: number | null;
  finalScore: number | null;
  feedback: string;
}

export interface ReviewScorePayload {
  section_code: string;
  nilai_dosen: number | null;
  nilai_final: number | null;
  feedback: string | null;
}

export function buildReviewPayload(
  slots: ReviewSlotInput[],
): ReviewScorePayload[] {
  return slots
    .filter((slot) => slot.hasSheet && slot.sheetId)
    .map((slot) => ({
      section_code: `S-${slot.label.toUpperCase()}`,
      nilai_dosen: slot.manualScore,
      nilai_final: slot.finalScore,
      feedback: slot.feedback || null,
    }));
}

async function runReviewRpc(
  functionName: 'save_submission_review' | 'finalize_submission_review',
  submissionId: string,
  scores: ReviewScorePayload[],
  model: string,
): Promise<void> {
  const { error } = await supabase.rpc(functionName, {
    p_submission_id: submissionId,
    p_scores: scores,
    p_model_ai: model,
  });
  if (error) throw error;
}

export async function saveSubmissionReview(
  submissionId: string,
  scores: ReviewScorePayload[],
  model: string,
): Promise<void> {
  await runReviewRpc('save_submission_review', submissionId, scores, model);
}

export async function finalizeSubmissionReview(
  submissionId: string,
  scores: ReviewScorePayload[],
  model: string,
): Promise<void> {
  await runReviewRpc('finalize_submission_review', submissionId, scores, model);
}

export async function requestAnswerReupload(
  submissionId: string,
  slotLabel: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('request_answer_reupload', {
    p_submission_id: submissionId,
    p_section_code: `S-${slotLabel.toUpperCase()}`,
    p_reason: reason.trim(),
  });
  if (error) throw error;
}
