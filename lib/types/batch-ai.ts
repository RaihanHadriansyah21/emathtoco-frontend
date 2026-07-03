// ============================================================
// EMATHTOCO — Batch AI Processing Types
// Shared between frontend components and API routes
// ============================================================

import {
  SECTION_CODES,
  getMaxScoreForSection,
  type AIModel,
  type SectionCode,
} from "@/lib/domain-contract";

export type { AIModel, SectionCode };

/**
 * Request payload for POST /predict (future integration).
 * model_type will be set to selectedModel from the dropdown.
 */
export interface PredictRequest {
  model_type: string;
}

/** All 24 section codes in processing order */
export const ALL_SECTION_CODES: readonly SectionCode[] = SECTION_CODES;
export { getMaxScoreForSection };

/** Request payload sent by the frontend to start batch processing */
export interface BatchAIRequest {
  model: AIModel;
  submissionIds: string[];
}

/** A single error that occurred during batch processing */
export interface BatchAIError {
  submissionId: string;
  sectionCode: SectionCode;
  sheetId: string;
  message: string;
}

/** Progress state returned by the status polling endpoint */
export interface BatchAIProgress {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  model: AIModel;
  currentSection: SectionCode | null;
  processedSheetsInSection: number;
  totalSheetsInSection: number;
  processedSections: number;
  totalSections: number;
  totalSubmissions: number;
  processedSubmissions: number;
  errors: BatchAIError[];
  startedAt: string | null;
  completedAt: string | null;
}

/** Response from the process endpoint when a job is started */
export interface BatchAIStartResponse {
  success: boolean;
  jobId: string;
  message: string;
}
