import type { NextConfig } from "next";
import * as fs from "fs";
import * as path from "path";

process.env.NEXT_TELEMETRY_DISABLED = "1";

function getAppVersion(): string {
  try {
    const versionPath = path.resolve(__dirname, "../VERSION");
    if (fs.existsSync(versionPath)) {
      const raw = fs.readFileSync(versionPath, "utf-8").trim();
      return raw.startsWith("v") ? raw : `v${raw}`;
    }
  } catch {
    // fallback to package.json
  }

  try {
    const pkgPath = path.resolve(__dirname, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.version) return pkg.version.startsWith("v") ? pkg.version : `v${pkg.version}`;
    }
  } catch {
    // default
  }

  return "v0.1.0";
}

const releaseVersion = getAppVersion();

const nextConfig: NextConfig = {
  // Keep your existing dev origins
  allowedDevOrigins: ["10.10.10.13", "10.10.20.11"],
  env: {
    NEXT_PUBLIC_APP_VERSION: releaseVersion,
  },
  async rewrites() {
    return [
      {
        source: '/busytex/:path*',
        destination: `/api/busytex-proxy?url=https://github.com/msoe-vex/engineering-notebook-editor/releases/download/${releaseVersion}/:path*`,
      },
      {
        source: '/latex/:path*',
        destination: `/api/busytex-proxy?url=https://github.com/msoe-vex/engineering-notebook-editor/releases/download/${releaseVersion}/:path*`,
      },
    ];
  },
};

export default nextConfig;