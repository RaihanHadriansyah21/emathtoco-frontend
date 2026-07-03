import { describe, expect, it } from 'vitest';

import { buildReviewPayload } from '@/lib/services/review-workflow-service';

describe('review workflow payload', () => {
  it('includes only persisted answer sheets and normalizes section codes', () => {
    expect(buildReviewPayload([
      {
        label: '1a',
        hasSheet: true,
        sheetId: 'sheet-1',
        manualScore: 0,
        finalScore: 0,
        feedback: '',
      },
      {
        label: '1b',
        hasSheet: false,
        manualScore: null,
        finalScore: null,
        feedback: 'ignored',
      },
    ])).toEqual([
      {
        section_code: 'S-1A',
        nilai_dosen: 0,
        nilai_final: 0,
        feedback: null,
      },
    ]);
  });
});
