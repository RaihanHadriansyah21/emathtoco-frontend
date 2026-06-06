// ============================================================
// EMATHTOCO — Batch AI Processing Types
// Shared between frontend components and API routes
// ============================================================

/** Valid AI model identifiers — matches backend model directory names */
export type AIModel = 'DenseNet121' | 'InceptionV3' | 'MobilenetV2' | (string & {});

/**
 * Request payload for POST /predict (future integration).
 * model_type will be set to selectedModel from the dropdown.
 */
export interface PredictRequest {
  model_type: string;
}

/** 24 valid section codes: S-1A through S-4F */
export type SectionCode =
  | 'S-1A' | 'S-1B' | 'S-1C' | 'S-1D' | 'S-1E' | 'S-1F'
  | 'S-2A' | 'S-2B' | 'S-2C' | 'S-2D' | 'S-2E' | 'S-2F'
  | 'S-3A' | 'S-3B' | 'S-3C' | 'S-3D' | 'S-3E' | 'S-3F'
  | 'S-4A' | 'S-4B' | 'S-4C' | 'S-4D' | 'S-4E' | 'S-4F';

/** All 24 section codes in processing order */
export const ALL_SECTION_CODES: SectionCode[] = [
  'S-1A', 'S-1B', 'S-1C', 'S-1D', 'S-1E', 'S-1F',
  'S-2A', 'S-2B', 'S-2C', 'S-2D', 'S-2E', 'S-2F',
  'S-3A', 'S-3B', 'S-3C', 'S-3D', 'S-3E', 'S-3F',
  'S-4A', 'S-4B', 'S-4C', 'S-4D', 'S-4E', 'S-4F',
];

/** Max score per section: A-E = 4, F = 5 */
export function getMaxScoreForSection(sectionCode: SectionCode): number {
  return sectionCode.endsWith('F') ? 5 : 4;
}

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
  status: 'idle' | 'processing' | 'completed' | 'error';
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
