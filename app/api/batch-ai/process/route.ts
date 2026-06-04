// ============================================================
// EMATHTOCO — Batch AI Process API Route
// POST /api/batch-ai/process
//
// Section-centric orchestration:
// For each of 24 sections, loads the model once, processes
// ALL students for that section, then moves to the next.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createJob, updateJob } from '@/lib/batch-ai-store';
import {
  ALL_SECTION_CODES,
  getMaxScoreForSection,
  type AIModel,
  type BatchAIProgress,
  type BatchAIError,
  type SectionCode,
} from '@/lib/types/batch-ai';

// Server-side Supabase client (uses same anon key but bypasses browser singleton)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function createServerSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Simulate an AI prediction for a single answer sheet section.
 * In production, this would call the actual CRNN/DenseNet/Inception
 * inference endpoint with the specific section model.
 */
function simulateAIPrediction(
  model: AIModel,
  sectionCode: SectionCode
): { score: number; confidence: number } {
  const maxScore = getMaxScoreForSection(sectionCode);
  // Produce realistic-looking scores (biased toward higher values)
  const minScore = Math.max(1, maxScore - 2);
  const score = Math.floor(Math.random() * (maxScore - minScore + 1)) + minScore;
  const confidence = Math.floor(Math.random() * 25) + 75; // 75-99%
  return { score, confidence };
}

/**
 * Small delay to simulate model inference time and prevent
 * overwhelming the database with concurrent writes.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, submissionIds } = body as {
      model: AIModel;
      submissionIds: string[];
    };

    // Validate inputs
    if (!model || !['CRNN', 'DenseNet', 'Inception'].includes(model)) {
      return NextResponse.json(
        { success: false, message: 'Model AI tidak valid.' },
        { status: 400 }
      );
    }

    if (!submissionIds || submissionIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Tidak ada pengumpulan tugas yang dipilih.' },
        { status: 400 }
      );
    }

    // Generate a unique job ID
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Initialize job progress
    const initialProgress: BatchAIProgress = {
      jobId,
      status: 'processing',
      model,
      currentSection: null,
      processedSheetsInSection: 0,
      totalSheetsInSection: 0,
      processedSections: 0,
      totalSections: ALL_SECTION_CODES.length,
      totalSubmissions: submissionIds.length,
      processedSubmissions: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    createJob(jobId, initialProgress);

    // Update all targeted submissions to 'processing_ai' immediately
    const supabase = createServerSupabase();
    await supabase
      .from('pengumpulan_tugas')
      .update({
        status_submit: 'processing_ai',
        model_ai: model,
        updated_at: new Date().toISOString(),
      })
      .in('id', submissionIds);

    // Start async processing (non-blocking — the response returns immediately)
    processBatchAsync(jobId, model, submissionIds).catch(err => {
      console.error('[BatchAI] Fatal processing error:', err);
      updateJob(jobId, {
        status: 'error',
        completedAt: new Date().toISOString(),
      });
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: `Batch processing dimulai untuk ${submissionIds.length} pengumpulan tugas.`,
    });

  } catch (err) {
    console.error('[BatchAI] Request error:', err);
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan internal server.' },
      { status: 500 }
    );
  }
}

/**
 * Core section-centric batch processing loop.
 * Runs asynchronously after the HTTP response is returned.
 *
 * Processing order:
 * FOR EACH section (S-1A, S-1B, ... S-4F):
 *   → "Load" the section-specific model
 *   → Fetch all lembar_jawaban matching this section across all target submissions
 *   → Run prediction on each sheet
 *   → Save results back to database
 *   → "Unload" model
 *   → Move to next section
 */
async function processBatchAsync(
  jobId: string,
  model: AIModel,
  submissionIds: string[]
): Promise<void> {
  const supabase = createServerSupabase();
  const allErrors: BatchAIError[] = [];
  const processedSubmissionSet = new Set<string>();

  for (let sectionIdx = 0; sectionIdx < ALL_SECTION_CODES.length; sectionIdx++) {
    const sectionCode = ALL_SECTION_CODES[sectionIdx];

    // Update progress: entering new section
    updateJob(jobId, {
      currentSection: sectionCode,
      processedSheetsInSection: 0,
      totalSheetsInSection: 0,
      processedSections: sectionIdx,
    });

    // Simulate "loading" the section-specific model
    // e.g., loading CRNN-S-1A model weights
    await delay(80);

    // Fetch all lembar_jawaban for this section across all target submissions
    // Skip sections with 'reupload_required' status — those need student re-upload first
    const { data: sheets, error: fetchError } = await supabase
      .from('lembar_jawaban')
      .select('id, pengumpulan_tugas_id, section_code, image_url, status')
      .eq('section_code', sectionCode)
      .neq('status', 'reupload_required')
      .in('pengumpulan_tugas_id', submissionIds);

    if (fetchError) {
      console.error(`[BatchAI] Error fetching sheets for ${sectionCode}:`, fetchError);
      allErrors.push({
        submissionId: 'ALL',
        sectionCode,
        sheetId: 'N/A',
        message: `Gagal mengambil data lembar jawaban: ${fetchError.message}`,
      });
      updateJob(jobId, { errors: [...allErrors] });
      continue;
    }

    if (!sheets || sheets.length === 0) {
      // No sheets for this section — skip
      updateJob(jobId, {
        processedSections: sectionIdx + 1,
      });
      continue;
    }

    updateJob(jobId, {
      totalSheetsInSection: sheets.length,
    });

    // Process each sheet sequentially (controlled, no parallel chaos)
    for (let sheetIdx = 0; sheetIdx < sheets.length; sheetIdx++) {
      const sheet = sheets[sheetIdx];

      try {
        // Run AI prediction (simulated)
        const prediction = simulateAIPrediction(model, sectionCode);

        // Build the prediction string matching existing format
        const aiPredictionStr = `${prediction.score} (Model AI: ${model}, Confidence: ${prediction.confidence}%)`;

        // Update the lembar_jawaban row
        const { error: updateError } = await supabase
          .from('lembar_jawaban')
          .update({
            prediksi_ai: aiPredictionStr,
            nilai_final: prediction.score,
            nilai_dosen: null, // Reset manual override on new AI run
            status: 'reviewed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', sheet.id);

        if (updateError) {
          throw updateError;
        }

        processedSubmissionSet.add(sheet.pengumpulan_tugas_id);

        // Small delay to prevent database overload (25-50ms per sheet)
        await delay(30);

      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[BatchAI] Error processing sheet ${sheet.id} in ${sectionCode}:`, errorMsg);
        allErrors.push({
          submissionId: sheet.pengumpulan_tugas_id,
          sectionCode,
          sheetId: sheet.id,
          message: errorMsg,
        });
      }

      // Update sheet-level progress
      updateJob(jobId, {
        processedSheetsInSection: sheetIdx + 1,
        processedSubmissions: processedSubmissionSet.size,
        errors: [...allErrors],
      });
    }

    // Simulate "unloading" the model
    await delay(30);

    // Mark section as completed
    updateJob(jobId, {
      processedSections: sectionIdx + 1,
    });
  }

  // Post-processing: update each pengumpulan_tugas with accumulated scores
  for (const submissionId of submissionIds) {
    try {
      // Calculate total score from all section final scores
      const { data: allSheets, error: sheetsError } = await supabase
        .from('lembar_jawaban')
        .select('nilai_final')
        .eq('pengumpulan_tugas_id', submissionId);

      if (sheetsError) throw sheetsError;

      const totalScore = (allSheets || []).reduce(
        (acc: number, s: { nilai_final: number | null }) => acc + (s.nilai_final || 0),
        0
      );

      const { error: subUpdateError } = await supabase
        .from('pengumpulan_tugas')
        .update({
          status_submit: 'reviewed',
          nilai_akhir: totalScore,
          model_ai: model,
          updated_at: new Date().toISOString(),
        })
        .eq('id', submissionId);

      if (subUpdateError) throw subUpdateError;

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[BatchAI] Error updating submission ${submissionId}:`, errorMsg);
      allErrors.push({
        submissionId,
        sectionCode: 'S-1A', // placeholder
        sheetId: 'N/A',
        message: `Gagal memperbarui nilai akhir: ${errorMsg}`,
      });
    }
  }

  // Mark job as completed
  updateJob(jobId, {
    status: allErrors.length > 0 ? 'completed' : 'completed',
    completedAt: new Date().toISOString(),
    processedSubmissions: processedSubmissionSet.size,
    errors: allErrors,
  });

  console.log(
    `[BatchAI] Job ${jobId} completed. Processed ${processedSubmissionSet.size} submissions, ${allErrors.length} errors.`
  );
}
