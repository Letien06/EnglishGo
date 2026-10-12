import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

const manifestId = process.env.GOOGLE_DRIVE_MANIFEST_ID ?? "";
const hasManifestId = /^[a-zA-Z0-9_-]{10,200}$/.test(manifestId);
// Do not hand NFT a wildcard rooted at every local snapshot when the build is
// running without the Drive manifest. The runtime provider still works in
// that mode, while this keeps local/preview builds from walking thousands of
// stale chunks just to calculate a trace.
const materialFolder = hasManifestId
  ? `./.content/dauenglish/${manifestId}`
  : "./.content/dauenglish";
const cacheRoot = path.join(process.cwd(), ".content", "dauenglish");
// Keep verified archives available locally so opening a question never needs
// an avoidable Drive round trip. Only the active manifest is included below.
function bundledMaterialPaths(): string[] {
  if (!hasManifestId) return [];
  try {
    const manifest = JSON.parse(readFileSync(path.join(cacheRoot, manifestId, "manifest.json"), "utf8")) as {
      entries?: Record<string, { sha256?: string }>;
    };
    return Object.values(manifest.entries ?? {})
      .map((entry) => entry.sha256)
      .filter((sha): sha is string => /^[a-f0-9]{64}$/.test(sha ?? ""))
      .map((sha) => `${materialFolder}/${sha}.json.gz`);
  } catch {
    // The prebuild step downloads/prepares this manifest before tracing. A
    // clean checkout can still be traced without it and will use Drive at
    // runtime, so avoid falling back to a directory wildcard here.
    return [];
  }
}
const bundledArchives = bundledMaterialPaths();
// Includes add back only the active snapshot's explicit file list.
const materialTraceExclude = "./.content/dauenglish/**/*";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_VERSION || String(Date.now()),
  },
  // The material bundle is read only by study pages and their content APIs.
  // Keeping it out of the landing/auth traces avoids copying every compressed
  // lesson chunk into the cold root function package.
  outputFileTracingIncludes: Object.fromEntries(
    [
      "/listen",
      "/listen/**",
      "/read",
      "/read/**",
      "/vocab",
      "/vocab/**",
      "/practice",
      "/practice/**",
      "/review/**",
      "/api/dautoeic/**",
      "/api/vocab/**",
      "/api/listening/**",
      "/api/reading/**",
      "/api/practice/**",
      "/api/dictation/**",
      "/api/admin/dautoeic-sync",
      "/api/grammar/**",
    ].map((route) => [route, [
      ...(hasManifestId ? [`${materialFolder}/manifest.json`, ...Array.from({ length: 7 }, (_, index) => `${materialFolder}/catalog-part-${index + 1}.json`), `${materialFolder}/grammar-answers.json`, `${materialFolder}/grammar-dictionary.json.gz`, ...bundledArchives] : []),
    ]]),
  ),
  outputFileTracingExcludes: {
    "/*": [materialTraceExclude],
  },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    // Vercel Image Optimization stores one optimized variant per URL/size.
    // TOEIC media has many remote images, so use browser-native loading to avoid
    // growing Vercel Images Storage while keeping next/image layout behavior.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "qfhmnlvgweznzcsoijyr.supabase.co",
      },
      {
        protocol: "https",
        hostname: "odlnhfaygiotcyehuysw.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0",
          },
        ],
      },
      // The Writing catalog is public, self-authored metadata. It deliberately
      // excludes learner data, audio, and test questions, so it can use a
      // short CDN cache while all other API routes stay private/no-store.
      {
        source: "/api/writing/prompts",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=300",
          },
        ],
      },
      {
        source: "/:all*(svg|png|jpg|jpeg|webp|ico|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
