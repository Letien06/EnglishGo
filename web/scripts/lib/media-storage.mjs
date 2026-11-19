import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const MEDIA_FIELDS = ["audioUrl", "audioUsUrl", "audioUkUrl", "imageUrl"];

export function sha256Bytes(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function storageMetadataMatches(metadata, checksum, bytes) {
  return metadata?.metadata?.sha256 === checksum && Number(metadata?.size) === bytes;
}

function safeSegment(value) {
  const clean = String(value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  if (!clean) throw new Error("Media identity contains an empty path segment.");
  return clean.slice(0, 180);
}

export function mediaStoragePath({ testId, part, itemType, itemId, mediaType, mediaVariant = mediaType }) {
  if (!Number.isInteger(part) || part < 1 || part > 7) throw new Error("Media part must be between 1 and 7.");
  if (mediaType !== "audio" && mediaType !== "image") throw new Error("Unsupported media type.");
  return ["dauenglish", safeSegment(testId), `part-${part}`, `${itemType === "passage" ? "passages" : "questions"}`, safeSegment(itemId), safeSegment(mediaVariant)].join("/");
}

function supplementalMediaStoragePath({ kind, groupId, itemId, mediaType, mediaVariant = mediaType }) {
  return ["dauenglish", safeSegment(kind), safeSegment(groupId), "items", safeSegment(itemId), safeSegment(mediaVariant)].join("/");
}

function mediaTypeForField(field) {
  return field.toLowerCase().includes("image") ? "image" : "audio";
}

function mediaVariantForField(field) {
  return field === "audioUsUrl" ? "audio-us" : field === "audioUkUrl" ? "audio-uk" : mediaTypeForField(field);
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

export function collectSnapshotMedia(snapshot) {
  const media = [];
  for (const material of snapshot.materials ?? []) {
    if (material.kind !== "test-part") continue;
    const payload = material.payload;
    const testId = payload?.test?.id;
    const part = payload?.part;
    if (!testId || !Number.isInteger(part)) continue;
    for (const itemType of ["passage", "question"]) {
      for (const item of payload[itemType === "passage" ? "passages" : "questions"] ?? []) {
        for (const field of MEDIA_FIELDS) {
          const sourceUrl = item?.[field];
          if (!isHttpUrl(sourceUrl)) continue;
          media.push({
            sourceUrl: sourceUrl.trim(),
            storagePath: mediaStoragePath({ testId, part, itemType, itemId: item.id, mediaType: mediaTypeForField(field), mediaVariant: mediaVariantForField(field) }),
            testId,
            part,
            itemType,
            itemId: String(item.id),
            field,
            mediaType: mediaTypeForField(field),
          });
        }
      }
    }
  }
  for (const material of snapshot.materials ?? []) {
    if (material.kind === "vocabulary") {
      for (const word of material.payload?.words ?? []) {
        for (const field of MEDIA_FIELDS) {
          const sourceUrl = word?.[field];
          if (!isHttpUrl(sourceUrl)) continue;
          media.push({ sourceUrl: sourceUrl.trim(), storagePath: supplementalMediaStoragePath({ kind: "vocabulary", groupId: word.partId ?? "all", itemId: word.id, mediaType: mediaTypeForField(field), mediaVariant: mediaVariantForField(field) }), testId: null, part: null, itemType: "vocabulary", itemId: String(word.id), field, mediaType: mediaTypeForField(field) });
        }
      }
    }
    if (material.kind === "dictation-set") {
      const setId = material.payload?.setId ?? material.key;
      for (const item of material.payload?.items ?? []) {
        const sourceUrl = item?.audioUrl;
        if (!isHttpUrl(sourceUrl)) continue;
        media.push({ sourceUrl: sourceUrl.trim(), storagePath: supplementalMediaStoragePath({ kind: "dictation", groupId: setId, itemId: item.id, mediaType: "audio" }), testId: null, part: null, itemType: "dictation", itemId: String(item.id), field: "audioUrl", mediaType: "audio" });
      }
    }
  }
  const unique = new Map();
  for (const item of media) {
    const existing = unique.get(item.sourceUrl);
    if (existing && existing.mediaType !== item.mediaType) throw new Error(`Media URL is used as both audio and image: ${item.sourceUrl}`);
    unique.set(item.sourceUrl, existing ?? item);
  }
  return [...unique.values()];
}

export const collectTestMedia = collectSnapshotMedia;

export function rewriteSnapshotMedia(snapshot, bySourceUrl) {
  let rewritten = 0;
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") {
      if (typeof value === "string") {
        const key = value.trim();
        if (bySourceUrl.has(key)) {
          rewritten++;
          return bySourceUrl.get(key).publicUrl;
        }
      }
      return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
  }
  return { snapshot: visit(snapshot), rewritten };
}

async function fetchBytes(url, timeoutMs, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error(`Media download failed (${response.status}): ${url}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error(`Media download returned an empty file: ${url}`);
      return { bytes, contentType: response.headers.get("content-type")?.split(";", 1)[0] || "application/octet-stream" };
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError;
}

function downloadUrl(bucketName, storagePath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;
}

async function storageBucket() {
  let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson && process.env.FIREBASE_SERVICE_ACCOUNT_PATH) serviceAccountJson = await readFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8");
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : "");
  if (!serviceAccountJson || !projectId || !bucketName) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID and FIREBASE_STORAGE_BUCKET (or the default bucket) are required for media sync.");
  const { cert, getApp, getApps, initializeApp } = await import("firebase-admin/app");
  const { getStorage } = await import("firebase-admin/storage");
  const app = getApps().length ? getApp() : initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId, storageBucket: bucketName });
  return getStorage(app).bucket(bucketName);
}

export async function syncMedia(snapshot, { timeoutMs = 30_000, retries = 2, concurrency = 4 } = {}) {
  const bucket = await storageBucket();
  const candidates = collectSnapshotMedia(snapshot);
  const bySourceUrl = new Map();
  const manifest = [];
  let cursor = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      const file = bucket.file(candidate.storagePath);
      const downloaded = await fetchBytes(candidate.sourceUrl, timeoutMs, retries);
      const digest = sha256Bytes(downloaded.bytes);
      let metadata;
      try { [metadata] = await file.getMetadata(); } catch (error) { if (error?.code !== 404) throw error; }
      let skipped = false;
      const rawTokens = metadata?.metadata?.firebaseStorageDownloadTokens;
      let token = typeof rawTokens === "string" ? rawTokens.split(",")[0]?.trim() : undefined;
      if (storageMetadataMatches(metadata, digest, downloaded.bytes.length)) {
        skipped = true;
      } else {
        token ||= randomUUID();
        await file.save(downloaded.bytes, {
          resumable: false,
          metadata: {
            contentType: downloaded.contentType,
            cacheControl: "public,max-age=31536000,immutable",
            metadata: { sha256: digest, sourceUrl: candidate.sourceUrl, firebaseStorageDownloadTokens: token },
          },
        });
      }
      token ||= randomUUID();
      if (!metadata?.metadata?.firebaseStorageDownloadTokens && skipped) await file.setMetadata({ metadata: { ...(metadata?.metadata ?? {}), firebaseStorageDownloadTokens: token } });
      const record = { ...candidate, publicUrl: downloadUrl(bucket.name, candidate.storagePath, token), sha256: digest, bytes: downloaded.bytes.length, contentType: downloaded.contentType, skipped, syncedAt: new Date().toISOString() };
      bySourceUrl.set(candidate.sourceUrl, record);
      manifest.push(record);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), candidates.length || 1) }, () => worker()));
  manifest.sort((a, b) => a.storagePath.localeCompare(b.storagePath));
  return { bySourceUrl, manifest, counts: { discovered: candidates.length, uploaded: manifest.filter((item) => !item.skipped).length, skipped: manifest.filter((item) => item.skipped).length, rewritten: 0 } };
}

