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
  ]
};

export default nextConfig;
