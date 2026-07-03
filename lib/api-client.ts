import { API_URL } from './config';
import { supabase } from './supabase';
import { getBackendState } from './backend-store';

export interface RequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: HeadersInit;
  timeoutMs?: number;
}

// ============================================================
// EMATHTOCO — Centralized API Client
//
// SEMUA komunikasi ke FastAPI backend WAJIB melalui modul ini.
// Otomatis menyisipkan bearer token dan Accept: application/json.
//
// Mendukung: GET, POST, PUT, PATCH, DELETE
// ============================================================

/**
 * Core fetch wrapper untuk komunikasi ke FastAPI backend.
 * - Otomatis menambahkan header `Accept: application/json`
 * - Merge dengan custom headers tanpa menimpa
 * - Debug logging untuk troubleshooting deployment
 */
export async function apiRequest(
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  // ── Pre-flight: reject immediately if backend is known offline ──────
  // This prevents 60s hangs, CORS errors, and console noise.
  const backendState = getBackendState();
  if (backendState === 'offline') {
    throw new Error('Backend AI sedang offline. Silakan coba lagi nanti.');
  }

  if (!path.startsWith('/')) {
    throw new Error('API path harus diawali dengan /.');
  }
  const url = `${API_URL}${path}`;

  const headers = new Headers();

  headers.set('Accept', 'application/json');

  // 2. Merge custom headers dari caller (tanpa menimpa defaults jika tidak diset)
  if (fetchOptions.headers) {
    const custom = new Headers(fetchOptions.headers);
    custom.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  // 3. Inject Supabase Access Token dynamically if session exists
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }
  } catch {
    throw new Error('Sesi autentikasi tidak dapat dibaca.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const mergedOptions: RequestInit = {
    ...fetchOptions,
    headers,
    signal: controller.signal,
  };

  try {
    const response = await fetch(url, mergedOptions);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * GET request ke backend FastAPI.
 */
export async function apiGet(
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  return apiRequest(path, { ...options, method: 'GET' });
}

/**
 * POST request ke backend FastAPI.
 * Otomatis serialize body object ke JSON dan set Content-Type.
 */
export async function apiPost(
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  let requestBody = options.body;

  if (body !== undefined && requestBody === undefined) {
    if (typeof body === 'object' && body !== null) {
      requestBody = JSON.stringify(body);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    } else {
      requestBody = body as BodyInit;
    }
  }

  return apiRequest(path, {
    ...options,
    method: 'POST',
    headers,
    body: requestBody,
  });
}

/**
 * PUT request ke backend FastAPI.
 * Otomatis serialize body object ke JSON dan set Content-Type.
 */
export async function apiPut(
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  let requestBody = options.body;

  if (body !== undefined && requestBody === undefined) {
    if (typeof body === 'object' && body !== null) {
      requestBody = JSON.stringify(body);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    } else {
      requestBody = body as BodyInit;
    }
  }

  return apiRequest(path, {
    ...options,
    method: 'PUT',
    headers,
    body: requestBody,
  });
}

/**
 * PATCH request ke backend FastAPI.
 * Otomatis serialize body object ke JSON dan set Content-Type.
 */
export async function apiPatch(
  path: string,
  body?: unknown,
  options: RequestOptions = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  let requestBody = options.body;

  if (body !== undefined && requestBody === undefined) {
    if (typeof body === 'object' && body !== null) {
      requestBody = JSON.stringify(body);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    } else {
      requestBody = body as BodyInit;
    }
  }

  return apiRequest(path, {
    ...options,
    method: 'PATCH',
    headers,
    body: requestBody,
  });
}

/**
 * DELETE request ke backend FastAPI.
 */
export async function apiDelete(
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  return apiRequest(path, { ...options, method: 'DELETE' });
}
