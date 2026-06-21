import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.100.9',
    '192.168.100.9:3000',
    '192.168.56.1',
    '192.168.56.1:3000'
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://hkxxhactpwiqdzecrbxw.supabase.co https://*.supabase.co https://prod.spline.design https://*.spline.design; connect-src 'self' https://hkxxhactpwiqdzecrbxw.supabase.co wss://hkxxhactpwiqdzecrbxw.supabase.co http://localhost:8000 http://127.0.0.1:8000 https://strife-trapper-dad.ngrok-free.dev https://prod.spline.design https://*.spline.design https://unpkg.com ws://* wss://*; media-src 'self' data: blob: https://hkxxhactpwiqdzecrbxw.supabase.co https://prod.spline.design https://*.spline.design; worker-src 'self' blob:; frame-ancestors 'none'; frame-src 'self' https://prod.spline.design https://*.spline.design;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
