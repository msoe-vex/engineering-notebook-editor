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
const assetsBase = (process.env.NEXT_PUBLIC_ASSETS_BASE_URL || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@engineering-notebook/shared"],
  env: {
    NEXT_PUBLIC_APP_VERSION: releaseVersion,
  },
  async redirects() {
    // Cloud UI lives at `/`. Keep old /cloud and /workspace bookmarks working.
    return [
      { source: "/cloud", destination: "/", permanent: false },
      { source: "/cloud/:path*", destination: "/:path*", permanent: false },
      { source: "/workspace/:path*", destination: "/", permanent: false },
    ];
  },
  async rewrites() {
    // When Core/GCS asset base is configured, proxy BusyTeX + LaTeX packages there.
    // Otherwise Next serves website/public/busytex and website/public/latex directly
    // (populate with npm run download:busytex && npm run bundle:template).
    if (!assetsBase) return [];
    return [
      {
        source: "/busytex/:path*",
        destination: `${assetsBase}/static/busytex/:path*`,
      },
      {
        source: "/latex/:path*",
        destination: `${assetsBase}/static/latex/:path*`,
      },
    ];
  },
};

export default nextConfig;
