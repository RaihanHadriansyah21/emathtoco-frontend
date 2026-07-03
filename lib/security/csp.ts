interface CspOptions {
  nonce: string;
  supabaseUrl: string;
  apiUrl: string;
  production: boolean;
}

export function buildContentSecurityPolicy({
  nonce,
  supabaseUrl,
  apiUrl,
  production,
}: CspOptions): string {
  const supabaseHost = new URL(supabaseUrl).host;
  const apiOrigin = new URL(apiUrl).origin;

  if (!production) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      `connect-src 'self' ${supabaseUrl} wss://${supabaseHost} ${apiOrigin} ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:* https://prod.spline.design https://*.spline.design`,
      "font-src 'self' data:",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
      "frame-src 'self' https://prod.spline.design https://*.spline.design",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseUrl} https://prod.spline.design https://*.spline.design`,
    `connect-src 'self' ${supabaseUrl} wss://${supabaseHost} ${apiOrigin} https://prod.spline.design https://*.spline.design`,
    "font-src 'self' data:",
    `media-src 'self' data: blob: ${supabaseUrl}`,
    "worker-src 'self' blob:",
    "frame-src 'self' https://prod.spline.design https://*.spline.design",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
