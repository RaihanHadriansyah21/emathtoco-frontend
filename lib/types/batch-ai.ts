import { SECTION_CODES, type AIModel, type SectionCode } from '@/lib/domain-contract';

// Re-export SECTION_CODES as ALL_SECTION_CODES for BatchAIModal usage
export const ALL_SECTION_CODES = SECTION_CODES;

// ============================================================
// Types for Batch AI Progress tracking
// ============================================================

export interface BatchAIError {
  submissionId: string;
  sectionCode: SectionCode;
  sheetId: string;
  message: string;
}

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
  startedAt: string;
  completedAt: string | null;
}
