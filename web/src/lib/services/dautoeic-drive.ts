import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { unstable_cache } from "next/cache";
import { serverEnv } from "../env";
import { ApiError } from "../api/response";
import { createDriveClient, driveFileId } from "../storage/google-drive";
import { driveManifestSchema, type DriveManifest } from "../storage/drive-manifest";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";
import { decodeBundledMaterial } from "../storage/bundled-material";
import { testPartCatalogIndexSchema, type TestPartCatalogEntry } from "../storage/test-part-catalog-index";

const gunzipAsync = promisify(gunzip);

interface ParsedCacheEntry<T> {
  value: T;
  bytes: number;
}

/**
 * Bounded LRU cache holding already-parsed & validated immutable projections so
 * hot reads avoid reparsing 16–25 MB JSON strings and re-running Zod schemas.
 */
function createObjectMemoryCache<T>(maxBytes: number, maxEntries: number) {
  const entries = new Map<string, ParsedCacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();
  let totalBytes = 0;

  function touch(key: string, entry: ParsedCacheEntry<T>) {
    entries.delete(key);
    entries.set(key, entry);
  }

  function evictIfNeeded() {
    while (entries.size > maxEntries || (totalBytes > maxBytes && entries.size > 1)) {
      const oldest = entries.entries().next().value as [string, ParsedCacheEntry<T>] | undefined;
      if (!oldest) break;
      entries.delete(oldest[0]);
      totalBytes -= oldest[1].bytes;
    }
  }

  return {
    async get(key: string, load: () => Promise<{ value: T; bytes: number }>): Promise<T> {
      const existing = entries.get(key);
      if (existing) {
        touch(key, existing);
        return existing.value;
      }
      const pending = inflight.get(key);
      if (pending) return pending;

      const promise = load()
        .then((loaded) => {
          if (loaded.bytes <= maxBytes) {
            const prev = entries.get(key);
            if (prev) totalBytes -= prev.bytes;
            entries.set(key, loaded);
            totalBytes += loaded.bytes;
            evictIfNeeded();
          }
          return loaded.value;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, promise);
      return promise;
    },
  };
}

const manifestMemory = createObjectMemoryCache<DriveManifest>(4_000_000, 2);
const materialMemory = createObjectMemoryCache<unknown>(64_000_000, 96);
const catalogIndexMemory = createObjectMemoryCache<Record<string, TestPartCatalogEntry> | null>(8_000_000, 7);
const projectionMemory = createObjectMemoryCache<unknown>(20_000_000, 4);

function bundledFile(manifestId: string, name: string): URL {
  if (
    !/^[a-zA-Z0-9_-]{10,200}$/.test(manifestId) ||
    !/^(manifest\.json|catalog-part-[1-7]\.json|grammar-answers\.json|grammar-dictionary\.json\.gz|vocab-catalog\.json|[a-f0-9]{64}\.json(?:\.gz)?)$/.test(name)
  ) {
    throw new Error("Invalid bundled material path.");
  }
  return new URL(`${manifestId}/${name}`, pathToFileURL(`${process.cwd()}/.content/dauenglish/`));
}

async function readParsedManifest(manifestId: string): Promise<DriveManifest> {
  return manifestMemory.get(manifestId, async () => {
    const localText = await bundledText(manifestId, "manifest.json");
    if (localText !== null) {
      return {
        value: driveManifestSchema.parse(JSON.parse(localText)),
        bytes: Buffer.byteLength(localText, "utf8"),
      };
    }
    const remote = await cachedManifest(manifestId);
    return { value: remote, bytes: Buffer.byteLength(JSON.stringify(remote), "utf8") };
  });
}

/** Build-generated metadata never falls back to scanning all question bodies. */
export async function readGrammarProjection(name: "grammar-answers.json" | "grammar-dictionary.json.gz"): Promise<unknown> {
  if (!isDriveContentEnabled()) throw new ApiError("Grammar material is unavailable.", 503);
  const manifestId = driveFileId(serverEnv.googleDriveManifestId);
  try {
    return await projectionMemory.get(`${manifestId}:${name}`, async () => {
      const [buffer, manifest] = await Promise.all([
        readFile(bundledFile(manifestId, name)),
        readParsedManifest(manifestId),
      ]);
      const text = name.endsWith(".gz")
        ? (await gunzipAsync(buffer, { maxOutputLength: 16_000_000 })).toString("utf8")
        : buffer.toString("utf8");
      const parsed = JSON.parse(text) as { snapshotSha256?: string };
      if (parsed.snapshotSha256 !== manifest.snapshotSha256) {
        throw new Error("Grammar projection snapshot mismatch.");
      }
      return { value: parsed, bytes: Buffer.byteLength(text, "utf8") };
    });
  } catch {
    throw new ApiError("Chưa tải được danh mục ngữ pháp. Vui lòng thử lại sau.", 503);
  }
}

async function bundledText(manifestId: string, name: string): Promise<string | null> {
  try {
    return await readFile(bundledFile(manifestId, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function bundledMaterial(
  manifestId: string,
  entry: { bytes: number; sha256: string },
): Promise<{ text: string; verified: boolean } | null> {
  let compressed: Buffer;
  try {
    compressed = await readFile(bundledFile(manifestId, `${entry.sha256}.json.gz`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const plain = await bundledText(manifestId, `${entry.sha256}.json`);
      return plain === null ? null : { text: plain, verified: false };
    }
    throw error;
  }
  // decodeBundledMaterial already verifies byte length and SHA-256 checksum.
  return { text: await decodeBundledMaterial(compressed, entry), verified: true };
}

let configuredClient: { fingerprint: string; client: ReturnType<typeof createDriveClient> } | undefined;

export function isDriveContentEnabled(): boolean {
  return serverEnv.dauToeicContentStorage === "google-drive";
}

export function contentCacheKey(): string {
  return `${DAUTOEIC_SOURCE_VERSION}:${serverEnv.dauToeicContentStorage}:${isDriveContentEnabled() ? serverEnv.googleDriveManifestId : "legacy"}`;
}

/** Read the build-time compact index used by the listening/reading catalog. */
export async function readDriveCatalogIndex(part: number): Promise<Record<string, TestPartCatalogEntry> | null> {
  if (!isDriveContentEnabled()) return null;
  try {
    const manifestId = driveFileId(serverEnv.googleDriveManifestId);
    return await catalogIndexMemory.get(`${manifestId}:catalog-part-${part}`, async () => {
      const text = await bundledText(manifestId, `catalog-part-${part}.json`);
      if (!text) return { value: null, bytes: 0 };
      const parsed = testPartCatalogIndexSchema.parse(JSON.parse(text)).entries;
      return { value: parsed, bytes: Buffer.byteLength(text, "utf8") };
    });
  } catch {
    return null;
  }
}

function driveClient() {
  const credentials = {
    clientId: serverEnv.googleDriveClientId,
    clientSecret: serverEnv.googleDriveClientSecret,
    refreshToken: serverEnv.googleDriveRefreshToken,
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(credentials)).digest("hex");
  if (configuredClient?.fingerprint !== fingerprint) {
    configuredClient = { fingerprint, client: createDriveClient(credentials) };
  }
  return configuredClient.client;
}

const cachedManifest = unstable_cache(async (fileId: string) => {
  const text = await driveClient().readText(fileId, 1_000_000);
  return driveManifestSchema.parse(JSON.parse(text));
}, ["dauenglish-drive-manifest-v1"], { revalidate: 3600 });

const cachedChunk = unstable_cache(async (fileId: string, expectedHash: string, expectedBytes: number) => {
  const text = await driveClient().readText(fileId, expectedBytes);
  if (Buffer.byteLength(text, "utf8") !== expectedBytes || createHash("sha256").update(text).digest("hex") !== expectedHash) {
    throw new Error("Drive material checksum mismatch.");
  }
  return text;
}, ["dauenglish-drive-chunk-v1"], { revalidate: 86400 });

export async function readDriveMaterial<T>(key: string): Promise<T> {
  try {
    const manifestId = driveFileId(serverEnv.googleDriveManifestId);
    const cached = await materialMemory.get(`${manifestId}:${key}`, async () => {
      const manifest = await readParsedManifest(manifestId);
      const entry = manifest.entries[key];
      if (!entry) throw new ApiError("Không tìm thấy tài liệu trong bản Google Drive hiện tại.", 404);
      const local = await bundledMaterial(manifestId, entry);
      let text: string;
      let alreadyVerified = false;
      if (local !== null) {
        text = local.text;
        alreadyVerified = local.verified;
      } else {
        const chunks: string[] = [];
        for (let offset = 0; offset < entry.chunks.length; offset += 4) {
          chunks.push(
            ...(await Promise.all(
              entry.chunks
                .slice(offset, offset + 4)
                .map((chunk) => cachedChunk(chunk.fileId, chunk.sha256, chunk.bytes)),
            )),
          );
        }
        text = chunks.join("");
      }
      if (
        !alreadyVerified &&
        (Buffer.byteLength(text) !== entry.bytes || createHash("sha256").update(text).digest("hex") !== entry.sha256)
      ) {
        throw new Error("Drive material checksum mismatch.");
      }
      return { value: JSON.parse(text) as T, bytes: entry.bytes };
    });
    return structuredClone(cached) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[dauenglish-drive]", error instanceof Error ? error.message : "Unable to read material");
    throw new ApiError("Chưa đọc được tài liệu từ Google Drive. Vui lòng thử lại hoặc kiểm tra kết nối Drive.", 503);
  }
}
