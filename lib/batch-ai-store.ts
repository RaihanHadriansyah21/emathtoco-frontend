// ============================================================
// EMATHTOCO — Batch AI Job Store
// In-memory store for tracking batch processing progress.
// Shared across API route handlers via module-level singleton.
// ============================================================

import type { BatchAIProgress } from '@/lib/types/batch-ai';

/**
 * Module-level Map that stores active/completed batch job states.
 * Since Next.js API routes run in the same Node.js process during dev,
 * this provides a simple way for the /process route to write progress
 * and the /status route to read it.
 *
 * Jobs are auto-cleaned after 10 minutes to prevent memory leaks.
 */
const jobStore = new Map<string, BatchAIProgress>();

const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getJob(jobId: string): BatchAIProgress | undefined {
  return jobStore.get(jobId);
}

export function setJob(jobId: string, progress: BatchAIProgress): void {
  jobStore.set(jobId, progress);
}

export function updateJob(jobId: string, updates: Partial<BatchAIProgress>): void {
  const existing = jobStore.get(jobId);
  if (existing) {
    jobStore.set(jobId, { ...existing, ...updates });
  }
}

export function createJob(jobId: string, initial: BatchAIProgress): void {
  jobStore.set(jobId, initial);

  // Auto-cleanup after TTL
  setTimeout(() => {
    jobStore.delete(jobId);
  }, JOB_TTL_MS);
}
