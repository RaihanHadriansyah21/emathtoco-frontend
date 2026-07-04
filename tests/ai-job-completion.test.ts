import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const batchModal = readFileSync(
  join(root, 'app', 'components', 'BatchAIModal.tsx'),
  'utf8',
);
const reviewPage = readFileSync(
  join(root, 'app', 'dosen', 'review', '[id]', 'page.tsx'),
  'utf8',
);
const studentPage = readFileSync(
  join(root, 'app', 'matkul', '[id]', 'page.tsx'),
  'utf8',
);

describe('AI job completion feedback', () => {
  it('handles terminal batch jobs and partial failures', () => {
    expect(batchModal).toContain("status.status === 'completed'");
    expect(batchModal).toContain('status.failed ?? {}');
    expect(batchModal).toContain('Batch AI Selesai Sebagian');
    expect(batchModal).toContain('onComplete()');
  });

  it('notifies lecturers after a single prediction completes', () => {
    expect(reviewPage).toContain("'Prediksi AI Selesai'");
    expect(reviewPage).toContain('job.failed?.[submissionId]');
    expect(reviewPage).toContain('await loadWorkspaceDetails()');
    expect(reviewPage).toContain('emathtoco:ai-job:');
  });

  it('persists and polls the student auto-run job', () => {
    expect(studentPage).toContain('emathtoco:ai-job:');
    expect(studentPage).toContain('setActiveAiJobId(autoRunData.job_id)');
    expect(studentPage).toContain("'Penilaian AI Selesai'");
    expect(studentPage).toContain('await pollSubmissionStatus()');
  });
});
