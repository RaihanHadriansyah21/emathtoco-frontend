import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { apiPost } from '@/lib/api-client';
import { getBackendState } from '@/lib/backend-store';

export interface CreateAuditLogParams {
  action: string;
  target: string;
  detail?: any;
  details?: any;
}

/**
 * Standardize model name to 'DenseNet121' as per user requirements.
 */
export function standardizeModelName(str: string): string {
  if (!str) return str;
  return str.replace(/DenseNet201/g, 'DenseNet121')
            .replace(/DenseNet-121/g, 'DenseNet121')
            .replace(/Dense\s+Net\s+121/g, 'DenseNet121')
            .replace(/\bDenseNet\b/g, 'DenseNet121')
            .replace(/\bInception\b/g, 'InceptionV3')
            .replace(/\bMobileNet\b/g, 'MobileNetV2')
            .replace(/\bMobilenetV2\b/g, 'MobileNetV2');
}

/**
 * Checks if the enterprise schema columns are available.
 * Caches the result to prevent repeated query errors in the console.
 */
let hasEnterpriseSchema: boolean | null = null;

export async function checkEnterpriseSchema(): Promise<boolean> {
  if (hasEnterpriseSchema !== null) return hasEnterpriseSchema;
  try {
    const { error } = await supabase
      .from('audit_log')
      .select('user_id')
      .limit(0);
    if (error) {
      if (error.code === '42703' || error.message?.includes('column')) {
        hasEnterpriseSchema = false;
        return false;
      }
    }
    hasEnterpriseSchema = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Centrally log events in a non-blocking way.
 * Writes are routed to the FastAPI backend to bypass RLS safely.
 *
 * BACKEND-AWARE: Skips silently if backend is known offline.
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  // Skip audit log entirely if backend is offline — no hang, no error
  if (getBackendState() === 'offline') {
    console.log('[AUDIT] Backend offline — skipping audit log');
    return;
  }

  try {
    let { action, target, detail, details } = params;
    let finalDetails = details !== undefined ? details : detail;

    // Standardize model names across action, target, and details
    if (typeof action === 'string') {
      action = standardizeModelName(action);
    }
    if (typeof target === 'string') {
      target = standardizeModelName(target);
    }

    if (finalDetails) {
      if (typeof finalDetails === 'string') {
        finalDetails = standardizeModelName(finalDetails);
      } else if (typeof finalDetails === 'object') {
        try {
          const detailStr = JSON.stringify(finalDetails);
          const updatedDetailStr = standardizeModelName(detailStr);
          finalDetails = JSON.parse(updatedDetailStr);
        } catch {
          // ignore parsing error and keep original object
        }
      }
    }

    const payload = {
      action: action,
      target: target,
      details: finalDetails
    };

    const response = await apiPost('/audit/log', payload);
    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[AUDIT] Backend API write failed:', errorText);
    }
  } catch (error) {
    // Non-blocking: catch everything, log it, do not crash the main workflow.
    console.error('[AUDIT] Error during createAuditLog:', error);
  }
}

