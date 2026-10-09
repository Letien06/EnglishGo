import type { NextConfig } from "next";
import { readdirSync } from "node:fs";
import path from "node:path";

const manifestId = process.env.GOOGLE_DRIVE_MANIFEST_ID ?? "";
const hasManifestId = /^[a-zA-Z0-9_-]{10,200}$/.test(manifestId);
const materialFolder = hasManifestId
  ? `./.content/dauenglish/${manifestId}`
  : "./.content/dauenglish/**";
const cacheRoot = path.join(process.cwd(), ".content", "dauenglish");
let inactiveMaterialFolders: string[] = [];
if (hasManifestId) {
  try {
    inactiveMaterialFolders = readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== manifestId)
      .map((entry) => `./.content/dauenglish/${entry.name}/**/*`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
      "/api/dautoeic/**",
      "/api/vocab/**",
      "/api/listening/**",
      "/api/reading/**",
      "/api/practice/**",
      "/api/dictation/**",
      "/api/admin/dautoeic-sync",
    ].map((route) => [route, [`${materialFolder}/manifest.json`, `${materialFolder}/catalog-part-*.json`, `${materialFolder}/*.json.gz`]]),
  ),
  outputFileTracingExcludes: {
    "/*": [..."0123456789abcdef"].map((prefix) => `./.content/dauenglish/**/${prefix}*.json`).concat(inactiveMaterialFolders),
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
            value: "public, max-age=1296000, s-maxage=300, stale-while-revalidate=86400",
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
