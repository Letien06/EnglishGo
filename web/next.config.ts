import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";

const manifestId = process.env.GOOGLE_DRIVE_MANIFEST_ID ?? "";
const hasManifestId = /^[a-zA-Z0-9_-]{10,200}$/.test(manifestId);
const materialFolder = hasManifestId
  ? `./.content/dauenglish/${manifestId}`
  : "./.content/dauenglish";
const cacheRoot = path.join(process.cwd(), ".content", "dauenglish");

type ManifestEntryMeta = { sha256?: string; kind?: string };

function readManifestEntries(): ManifestEntryMeta[] {
  if (!hasManifestId) return [];
  try {
    const manifest = JSON.parse(readFileSync(path.join(cacheRoot, manifestId, "manifest.json"), "utf8")) as {
      entries?: Record<string, ManifestEntryMeta>;
    };
    return Object.values(manifest.entries ?? {});
  } catch {
    return [];
  }
}

function archivesForKinds(entries: ManifestEntryMeta[], kinds: readonly string[] | null): string[] {
  if (!hasManifestId) return [];
  const allowed = kinds ? new Set(kinds) : null;
  const unique = new Set<string>();
  for (const entry of entries) {
    if (allowed && (!entry.kind || !allowed.has(entry.kind))) continue;
    if (/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
      unique.add(`${materialFolder}/${entry.sha256}.json.gz`);
    }
  }
  return [...unique];
}

const manifestEntries = readManifestEntries();
const baseManifest = hasManifestId ? [`${materialFolder}/manifest.json`] : [];
const catalogParts = (parts: number[]) =>
  hasManifestId ? parts.map((p) => `${materialFolder}/catalog-part-${p}.json`) : [];
const grammarProjections = hasManifestId
  ? [`${materialFolder}/grammar-answers.json`, `${materialFolder}/grammar-dictionary.json.gz`]
  : [];

const vocabArchives = archivesForKinds(manifestEntries, ["vocabulary"]);
const grammarArchives = archivesForKinds(manifestEntries, ["grammar-catalog", "grammar-topic"]);
const dictationArchives = archivesForKinds(manifestEntries, ["dictation-catalog", "dictation-set"]);
const listeningReadingPracticeArchives = archivesForKinds(manifestEntries, [
  "tests",
  "test-part",
  "difficulty-levels",
  "difficulty-session",
]);
const allArchives = archivesForKinds(manifestEntries, null);

const materialTraceExclude = "./.content/dauenglish/**/*";

function routeTraceEntries(routes: string[], files: string[]): Array<[string, string[]]> {
  return routes.map((route) => [route, files]);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BUILD_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_VERSION || String(Date.now()),
  },
  // Narrow each route family's file trace to only the material slice it reads,
  // avoiding bundling all 40+ MB of archives into unrelated serverless functions.
  outputFileTracingIncludes: Object.fromEntries([
    ...routeTraceEntries(
      ["/listen", "/listen/**", "/api/listening/**"],
      [...baseManifest, ...catalogParts([1, 2, 3, 4]), ...listeningReadingPracticeArchives, ...dictationArchives],
    ),
    ...routeTraceEntries(
      ["/read", "/read/**", "/api/reading/**"],
      [...baseManifest, ...catalogParts([5, 6, 7]), ...grammarProjections, ...grammarArchives, ...listeningReadingPracticeArchives],
    ),
    ...routeTraceEntries(
      ["/api/grammar/**"],
      [...baseManifest, ...grammarProjections, ...grammarArchives],
    ),
    ...routeTraceEntries(
      ["/api/dictation/**"],
      [...baseManifest, ...dictationArchives],
    ),
    ...routeTraceEntries(
      ["/vocab", "/vocab/**", "/api/vocab/**"],
      [...baseManifest, ...vocabArchives],
    ),
    ...routeTraceEntries(
      ["/practice", "/practice/**", "/review/**", "/api/practice/**"],
      [...baseManifest, ...catalogParts([1, 2, 3, 4, 5, 6, 7]), ...listeningReadingPracticeArchives],
    ),
    ...routeTraceEntries(
      ["/api/dautoeic/**", "/api/admin/dautoeic-sync"],
      [...baseManifest, ...catalogParts([1, 2, 3, 4, 5, 6, 7]), ...grammarProjections, ...allArchives],
    ),
  ]),
  outputFileTracingExcludes: {
    "/*": [materialTraceExclude],
  },
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
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
      {
        source: "/api/writing/prompts",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=300",
          },
        ],
      },
      // Versioned static assets under /writing/*-v1.webp, /media/dauenglish/*, and
      // /_next/static can be cached immutably; keep unversioned root icons/OG images revalidatable.
      {
        source: "/writing/:path*-v1.webp",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/media/dauenglish/:path*",
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
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
