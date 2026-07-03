import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';

const ANSWER_BUCKET = 'lembar-jawaban';
const UPLOAD_TIMEOUT_MS = 60_000;

interface ReplaceAnswerImageInput {
  submissionId: string;
  userId: string;
  sectionCode: string;
  file: File;
  createPreviewUrl: (path: string) => Promise<string | null>;
}

export interface ReplaceAnswerImageResult {
  imagePath: string;
  signedUrl: string;
}

async function uploadWithTimeout(path: string, file: File): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          'Unggahan kedaluwarsa (timeout 60 detik). '
          + 'Silakan coba lagi dengan koneksi yang lebih stabil.',
        ),
      );
    }, UPLOAD_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([
      supabase.storage.from(ANSWER_BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: 'image/jpeg',
        upsert: false,
      }),
      timeout,
    ]);
    if (result.error) throw result.error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function removeNewObject(path: string): Promise<void> {
  try {
    await supabase.storage.from(ANSWER_BUCKET).remove([path]);
  } catch (error) {
    logger.error('Failed to clean up orphan answer object.', error);
  }
}

export async function replaceAnswerImage({
  submissionId,
  userId,
  sectionCode,
  file,
  createPreviewUrl,
}: ReplaceAnswerImageInput): Promise<ReplaceAnswerImageResult> {
  const imagePath =
    `${userId}/${submissionId}/${sectionCode}/${crypto.randomUUID()}.jpg`;
  let metadataCommitted = false;

  try {
    await uploadWithTimeout(imagePath, file);

    const signedUrl = await createPreviewUrl(imagePath);
    if (!signedUrl) {
      throw new Error('Gagal menghasilkan signed URL preview berkas terunggah.');
    }

    const { data: metadataRows, error: metadataError } = await supabase.rpc(
      'upsert_answer_metadata',
      {
        p_submission_id: submissionId,
        p_section_code: sectionCode,
        p_image_url: imagePath,
      },
    );
    if (metadataError) throw metadataError;
    metadataCommitted = true;

    const metadata = Array.isArray(metadataRows)
      ? metadataRows[0]
      : metadataRows;
    const previousPath = metadata?.previous_image_url as
      | string
      | null
      | undefined;

    if (previousPath && previousPath !== imagePath) {
      const { error } = await supabase.storage
        .from(ANSWER_BUCKET)
        .remove([previousPath]);
      if (error) {
        logger.warn('Old answer object cleanup deferred.');
      }
    }

    return { imagePath, signedUrl };
  } catch (error) {
    if (!metadataCommitted) {
      await removeNewObject(imagePath);
    }
    throw error;
  }
}
