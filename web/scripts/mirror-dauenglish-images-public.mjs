import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const [inputFile, outputFile, ...extra] = process.argv.slice(2);
if (!inputFile || !outputFile || extra.length) {
  throw new Error("Usage: mirror-dauenglish-images-public.mjs <input-materials.json> <output-materials.json>");
}
if (path.resolve(inputFile) === path.resolve(outputFile)) {
  throw new Error("Choose a new output file; retain the source snapshot.");
}

const jiti = createJiti(import.meta.url, { fsCache: false });
const { normalizeDauToeicImageUrl } = await jiti.import("../src/lib/services/dautoeic-media.ts");

const publicMediaDir = fileURLToPath(new URL("../public/media/dauenglish/", import.meta.url));
await mkdir(publicMediaDir, { recursive: true });

function extFromContentType(contentType, url) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("png")) return ".png";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("avif")) return ".avif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".webp")) return ".webp";
  if (pathname.endsWith(".png")) return ".png";
  if (pathname.endsWith(".gif")) return ".gif";
  return ".jpg";
}

async function fetchImage(url, retries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() || "";
      if (!contentType.startsWith("image/")) {
        throw new Error(`Unexpected content-type "${contentType}" for ${url}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error(`Empty image body for ${url}`);
      return { bytes, contentType };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

const snapshot = JSON.parse(await readFile(inputFile, "utf8"));
const PRACTICE_KINDS = new Set(["test-part", "difficulty-session"]);

// Collect all unique remote practice image URLs (and normalize legacy Part 1 paths if any remain)
const rawToEffective = new Map();
function collect(node) {
  if (Array.isArray(node)) {
    for (const item of node) collect(item);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (k === "imageUrl" && typeof v === "string" && /^https?:\/\//i.test(v.trim())) {
      const raw = v.trim();
      if (!rawToEffective.has(raw)) {
        const normalized = normalizeDauToeicImageUrl(raw) || raw;
        rawToEffective.set(raw, normalized);
      }
    } else if (v && typeof v === "object") {
      collect(v);
    }
  }
}

for (const material of snapshot.materials ?? []) {
  if (PRACTICE_KINDS.has(material.kind)) collect(material.payload);
}

const uniqueEffective = [...new Set(rawToEffective.values())];
console.log(JSON.stringify({ discoveredRawUrls: rawToEffective.size, uniqueFetchUrls: uniqueEffective.length }));

const effectiveToPublic = new Map();
const failures = [];
let downloaded = 0;
let reused = 0;
let totalBytes = 0;
let cursor = 0;

async function worker() {
  while (cursor < uniqueEffective.length) {
    const url = uniqueEffective[cursor++];
    try {
      const { bytes, contentType } = await fetchImage(url);
      const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
      const ext = extFromContentType(contentType, url);
      const filename = `${digest}${ext}`;
      const targetPath = path.join(publicMediaDir, filename);
      let exists = false;
      try {
        const st = await stat(targetPath);
        exists = st.size === bytes.length;
      } catch {
        exists = false;
      }
      if (exists) {
        reused++;
      } else {
        await writeFile(targetPath, bytes);
        downloaded++;
      }
      totalBytes += bytes.length;
      effectiveToPublic.set(url, `/media/dauenglish/${filename}`);
    } catch (error) {
      failures.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

await Promise.all(Array.from({ length: 8 }, () => worker()));

if (failures.length > 0) {
  console.error(JSON.stringify({ failedCount: failures.length, failures }, null, 2));
  process.exitCode = 1;
  throw new Error(`Image mirroring failed for ${failures.length} URL(s). Refusing to write incomplete snapshot.`);
}

let rewritten = 0;
function rewrite(node) {
  if (Array.isArray(node)) return node.map(rewrite);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "imageUrl" && typeof v === "string" && rawToEffective.has(v.trim())) {
      const effective = rawToEffective.get(v.trim());
      out[k] = effectiveToPublic.get(effective);
      rewritten++;
    } else if (v && typeof v === "object") {
      out[k] = rewrite(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

const nextSnapshot = {
  ...snapshot,
  materials: (snapshot.materials ?? []).map((material) =>
    PRACTICE_KINDS.has(material.kind)
      ? { ...material, payload: rewrite(material.payload) }
      : material,
  ),
};

await mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
await writeFile(outputFile, JSON.stringify(nextSnapshot), { encoding: "utf8", flag: "wx", mode: 0o600 });

console.log(
  JSON.stringify(
    {
      outputFile: path.resolve(outputFile),
      publicMediaDir,
      uniqueImages: effectiveToPublic.size,
      downloaded,
      reused,
      rewritten,
      totalMB: Number((totalBytes / 1024 / 1024).toFixed(2)),
    },
    null,
    2,
  ),
);
