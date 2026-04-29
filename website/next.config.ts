import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  allowedDevOrigins: ["10.10.10.13", "10.10.20.11"],
};

export default nextConfig;