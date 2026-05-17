import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep your existing dev origins
  allowedDevOrigins: ["10.10.10.13", "10.10.20.11"],
  async rewrites() {
    const isProd = process.env.NODE_ENV === 'production';
    if (!isProd) return [];
    return [
      {
        source: '/busytex/:path*',
        destination: '/api/busytex-proxy?url=https://github.com/msoe-vex/engineering-notebook-editor/releases/download/v0.1.0/:path*',
      },
    ];
  },
};

export default nextConfig;