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
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://hkxxhactpwiqdzecrbxw.supabase.co https://*.supabase.co https://prod.spline.design; connect-src 'self' https://hkxxhactpwiqdzecrbxw.supabase.co wss://hkxxhactpwiqdzecrbxw.supabase.co https://strife-trapper-dad.ngrok-free.dev https://prod.spline.design ws://* wss://*; media-src 'self' blob: https://hkxxhactpwiqdzecrbxw.supabase.co https://prod.spline.design; worker-src 'self' blob:; frame-ancestors 'none'; frame-src 'self' https://prod.spline.design;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
