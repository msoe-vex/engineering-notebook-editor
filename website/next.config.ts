import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/engineering-notebook-editor",
  assetPrefix: "/engineering-notebook-editor/",
  allowedDevOrigins: ["10.10.10.13", "10.10.20.11"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;