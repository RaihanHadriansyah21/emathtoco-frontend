const FAST_STATUS_POLL_MS = 5_000;
const PASSIVE_STATUS_POLL_MS = 30_000;

export function getSubmissionStatusPollDelay(
  status: string | null,
): number | null {
  if (!status || status === 'draft' || status === 'finalized') {
    return null;
  }
  if (status === 'processing_ai') {
    return FAST_STATUS_POLL_MS;
  }
  return PASSIVE_STATUS_POLL_MS;
}
