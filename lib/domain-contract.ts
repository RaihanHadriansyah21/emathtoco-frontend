export const USER_ROLES = ["admin", "dosen", "mahasiswa"] as const;

export const AI_MODELS = [
  "MobileNetV2",
  "DenseNet121",
  "InceptionV3",
] as const;

export const SUBMISSION_STATUSES = [
  "draft",
  "reupload_required",
  "submitted",
  "processing_ai",
  "reviewed",
  "finalized",
  "failed",
] as const;

export const AI_STATUSES = [
  "idle",
  "pending",
  "processing",
  "completed",
  "failed",
  "reviewed",
  "finalized",
] as const;

export const SECTION_CODES = [
  "S-1A", "S-1B", "S-1C", "S-1D", "S-1E", "S-1F",
  "S-2A", "S-2B", "S-2C", "S-2D", "S-2E", "S-2F",
  "S-3A", "S-3B", "S-3C", "S-3D", "S-3E", "S-3F",
  "S-4A", "S-4B", "S-4C", "S-4D", "S-4E", "S-4F",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type AIModel = (typeof AI_MODELS)[number];
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type AIStatus = (typeof AI_STATUSES)[number];
export type SectionCode = (typeof SECTION_CODES)[number];

export function getMaxScoreForSection(sectionCode: SectionCode): number {
  return sectionCode.endsWith("F") ? 5 : 4;
}
