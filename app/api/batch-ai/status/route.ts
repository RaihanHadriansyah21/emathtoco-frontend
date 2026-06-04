// ============================================================
// EMATHTOCO — Batch AI Status Polling API Route
// GET /api/batch-ai/status?jobId=xxx
//
// Lightweight endpoint for the frontend to poll processing
// progress from the in-memory job store.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/batch-ai-store';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json(
      { success: false, message: 'Parameter jobId diperlukan.' },
      { status: 400 }
    );
  }

  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      { success: false, message: 'Job tidak ditemukan atau sudah expired.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    progress: job,
  });
}
