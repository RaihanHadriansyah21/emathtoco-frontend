import { describe, expect, it } from 'vitest';

import { getSubmissionStatusPollDelay } from '@/lib/egress-policy';

describe('egress polling policy', () => {
  it('does not poll immutable or locally controlled states', () => {
    expect(getSubmissionStatusPollDelay(null)).toBeNull();
    expect(getSubmissionStatusPollDelay('draft')).toBeNull();
    expect(getSubmissionStatusPollDelay('finalized')).toBeNull();
  });

  it('polls only the status row faster while AI is active', () => {
    expect(getSubmissionStatusPollDelay('processing_ai')).toBe(5_000);
    expect(getSubmissionStatusPollDelay('submitted')).toBe(30_000);
    expect(getSubmissionStatusPollDelay('reupload_required')).toBe(30_000);
  });
});
