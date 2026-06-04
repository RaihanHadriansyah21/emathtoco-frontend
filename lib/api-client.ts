import { API_URL } from './config';

export interface RequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: HeadersInit;
}

// ============================================================
// EMATHTOCO — Centralized API Client
//
// SEMUA komunikasi ke FastAPI backend WAJIB melalui modul ini.
// Otomatis menyisipkan header ngrok-skip-browser-warning,
// Accept: application/json, dan logging debug.
//
// Mendukung: GET, POST, PUT, PATCH, DELETE
// ============================================================

/**
 * Core fetch wrapper untuk komunikasi ke FastAPI backend.
 * - Otomatis menambahkan header `ngrok-skip-browser-warning: true`
 * - Otomatis menambahkan header `Accept: application/json`
 * - Merge dengan custom headers tanpa menimpa
 * - Debug logging untuk troubleshooting deployment
 */
export async function apiRequest(
  path: string,
  options: RequestOptions = {}
): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  // Build headers: ngrok bypass + Accept default + user custom headers
  const headers = new Headers();

  // 1. Set default headers terlebih dahulu
  headers.set('ngrok-skip-browser-warning', 'true');
  headers.set('Accept', 'application/json');

  // 2. Merge custom headers dari caller (tanpa menimpa defaults jika tidak diset)
  if (options.headers) {
    const custom = new Headers(options.headers);
    custom.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
  };

  // Debug logging (dapat dihapus setelah deployment stabil)
  console.log('[API DEBUG] URL:', url);
  console.log('[API DEBUG] METHOD:', mergedOptions.method || 'GET');

  return fetch(url, mergedOptions);
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
