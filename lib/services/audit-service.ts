import { supabase } from '@/lib/supabase';
import { normalizeRole } from '@/lib/utils';
import { apiPost } from '@/lib/api-client';

export interface CreateAuditLogParams {
  action: string;
  target: string;
  detail: any;
  userId?: string | null;
  userName?: string | null;
  role?: string | null;
}

/**
 * Standardize model name to 'DenseNet121' as per user requirements.
 */
export function standardizeModelName(str: string): string {
  if (!str) return str;
  return str.replace(/DenseNet201/g, 'DenseNet121')
            .replace(/DenseNet-121/g, 'DenseNet121')
            .replace(/Dense\s+Net\s+121/g, 'DenseNet121');
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
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  try {
    let { action, target, detail, userId, userName, role } = params;

    // Standardize model names across action, target, and details
    if (typeof action === 'string') {
      action = standardizeModelName(action);
    }
    if (typeof target === 'string') {
      target = standardizeModelName(target);
    }

    if (detail) {
      if (typeof detail === 'string') {
        detail = standardizeModelName(detail);
      } else if (typeof detail === 'object') {
        try {
          const detailStr = JSON.stringify(detail);
          const updatedDetailStr = standardizeModelName(detailStr);
          detail = JSON.parse(updatedDetailStr);
        } catch {
          // ignore parsing error and keep original object
        }
      }
    }

    // Resolve user details from active session if missing
    if (!userId || !userName || !role) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          if (!userId) userId = user.id;
          
          const { data: profile } = await supabase
            .from('profil_pengguna')
            .select('nama_lengkap, role')
            .eq('id', user.id)
            .maybeSingle();

          if (profile) {
            if (!userName) userName = profile.nama_lengkap || user.email || 'Anonymous';
            if (!role) role = normalizeRole(profile.role);
          } else {
            if (!userName) userName = user.email || 'Anonymous';
            if (!role) role = 'unknown';
          }
        } else {
          // Fallback for system / guest actions
          if (!userId) userId = null;
          if (!userName) userName = 'System';
          if (!role) role = 'system';
        }
      } catch (authErr) {
        console.warn('[AUDIT] Failed to fetch session user for audit log:', authErr);
        if (!userId) userId = null;
        if (!userName) userName = 'System';
        if (!role) role = 'system';
      }
    }

    const payload = {
      user_id: userId,
      user_name: userName,
      role: role,
      action: action,
      target: target,
      detail: detail
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

