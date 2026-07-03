import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { SignedUrlCache } from '@/lib/storage/signed-url-cache';

const ANSWER_BUCKET = 'lembar-jawaban';
const SIGNED_URL_LIFETIME_SECONDS = 3600;
const CACHE_TTL_MS = 50 * 60 * 1000;
const CACHE_SAFETY_WINDOW_MS = 60 * 1000;

const answerImageUrlCache = new SignedUrlCache(
  CACHE_TTL_MS,
  CACHE_SAFETY_WINDOW_MS,
);

async function signAnswerImagePaths(
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const { data, error } = await supabase.storage
    .from(ANSWER_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_LIFETIME_SECONDS);
  if (error) throw error;

  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      signed.set(item.path, item.signedUrl);
    }
  }
  return signed;
}

export function getCachedAnswerImageUrl(path: string): string | null {
  return answerImageUrlCache.get(path);
}

export async function getAnswerImageUrls(
  paths: string[],
): Promise<Map<string, string>> {
  try {
    return await answerImageUrlCache.resolve(paths, signAnswerImagePaths);
  } catch (error) {
    logger.error('Failed to sign answer image paths.', error);
    return new Map();
  }
}

export async function getAnswerImageUrl(path: string): Promise<string | null> {
  const urls = await getAnswerImageUrls([path]);
  return urls.get(path) ?? null;
}

export function invalidateAnswerImageUrl(path: string): void {
  answerImageUrlCache.invalidate(path);
}

export function clearAnswerImageUrlCache(): void {
  answerImageUrlCache.clear();
}
