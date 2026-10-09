import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { unstable_cache } from "next/cache";
import { serverEnv } from "../env";
import { ApiError } from "../api/response";
import { createDriveClient, driveFileId } from "../storage/google-drive";
import { driveManifestSchema } from "../storage/drive-manifest";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";
import { createTextMemoryCache } from "../storage/text-memory-cache";
import { decodeBundledMaterial } from "../storage/bundled-material";
import { testPartCatalogIndexSchema, type TestPartCatalogEntry } from "../storage/test-part-catalog-index";

const manifestMemory = createTextMemoryCache(2_000_000, 2);
const materialMemory = createTextMemoryCache(32_000_000, 128);
// Keep all seven Part projections warm for a process. A single-entry cache
// caused alternating Part navigation to re-read every index.
const catalogIndexMemory = createTextMemoryCache(8_000_000, 7);
const projectionMemory = createTextMemoryCache(16_000_000, 2);

/** Build-generated metadata never falls back to scanning all question bodies. */
export async function readGrammarProjection(name: "grammar-answers.json" | "grammar-dictionary.json.gz"): Promise<unknown> {
  if (!isDriveContentEnabled()) throw new ApiError("Grammar material is unavailable.", 503);
  const manifestId = driveFileId(serverEnv.googleDriveManifestId);
  try {
    const text = await projectionMemory.get(`${manifestId}:${name}`, async () => {
      const buffer = await readFile(path.join(process.cwd(), ".content", "dauenglish", manifestId, name));
      const text = name.endsWith(".gz") ? gunzipSync(buffer, { maxOutputLength: 16_000_000 }).toString("utf8") : buffer.toString("utf8");
      const manifestText = await manifestMemory.get(manifestId, async () =>
        await bundledText(manifestId, "manifest.json") ?? JSON.stringify(await cachedManifest(manifestId)),
      );
      const manifest = driveManifestSchema.parse(JSON.parse(manifestText));
      if (JSON.parse(text).snapshotSha256 !== manifest.snapshotSha256) throw new Error("Grammar projection snapshot mismatch.");
      return text;
    });
    return JSON.parse(text);
  } catch {
    throw new ApiError("Chưa tải được danh mục ngữ pháp. Vui lòng thử lại sau.", 503);
  }
}

async function bundledText(manifestId: string, name: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), ".content", "dauenglish", manifestId, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function bundledMaterial(manifestId: string, entry: { bytes: number; sha256: string }): Promise<string | null> {
  let compressed: Buffer;
  try {
    compressed = await readFile(path.join(process.cwd(), ".content", "dauenglish", manifestId, `${entry.sha256}.json.gz`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return bundledText(manifestId, `${entry.sha256}.json`);
    throw error;
  }
  return decodeBundledMaterial(compressed, entry);
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
    const text = await catalogIndexMemory.get(`${manifestId}:catalog-part-${part}`, async () =>
      await bundledText(manifestId, `catalog-part-${part}.json`) ?? "",
    );
    if (!text) return null;
    return testPartCatalogIndexSchema.parse(JSON.parse(text)).entries;
  } catch {
    return null;
  }
}

function driveClient() {
  const credentials = { clientId: serverEnv.googleDriveClientId, clientSecret: serverEnv.googleDriveClientSecret, refreshToken: serverEnv.googleDriveRefreshToken };
  const fingerprint = createHash("sha256").update(JSON.stringify(credentials)).digest("hex");
  if (configuredClient?.fingerprint !== fingerprint) configuredClient = { fingerprint, client: createDriveClient(credentials) };
  return configuredClient.client;
}

const cachedManifest = unstable_cache(async (fileId: string) => {
  const text = await driveClient().readText(fileId, 1_000_000);
  return driveManifestSchema.parse(JSON.parse(text));
}, ["dauenglish-drive-manifest-v1"], { revalidate: 3600 });

const cachedChunk = unstable_cache(async (fileId: string, expectedHash: string, expectedBytes: number) => {
  const text = await driveClient().readText(fileId, expectedBytes);
  if (Buffer.byteLength(text, "utf8") !== expectedBytes || createHash("sha256").update(text).digest("hex") !== expectedHash) throw new Error("Drive material checksum mismatch.");
  return text;
}, ["dauenglish-drive-chunk-v1"], { revalidate: 86400 });

export async function readDriveMaterial<T>(key: string): Promise<T> {
  try {
    const manifestId = driveFileId(serverEnv.googleDriveManifestId);
    const text = await materialMemory.get(`${manifestId}:${key}`, async () => {
      const manifestText = await manifestMemory.get(manifestId, async () =>
        await bundledText(manifestId, "manifest.json") ?? JSON.stringify(await cachedManifest(manifestId)),
      );
      const manifest = driveManifestSchema.parse(JSON.parse(manifestText));
      const entry = manifest.entries[key];
      if (!entry) throw new ApiError("Không tìm thấy tài liệu trong bản Google Drive hiện tại.", 404);
      let material = await bundledMaterial(manifestId, entry);
      if (material === null) {
        const chunks: string[] = [];
        for (let offset = 0; offset < entry.chunks.length; offset += 4) {
          chunks.push(...await Promise.all(entry.chunks.slice(offset, offset + 4).map((chunk) => cachedChunk(chunk.fileId, chunk.sha256, chunk.bytes))));
        }
        material = chunks.join("");
      }
      if (Buffer.byteLength(material) !== entry.bytes || createHash("sha256").update(material).digest("hex") !== entry.sha256) throw new Error("Drive material checksum mismatch.");
      return material;
    });
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[dauenglish-drive]", error instanceof Error ? error.message : "Unable to read material");
    throw new ApiError("Chưa đọc được tài liệu từ Google Drive. Vui lòng thử lại hoặc kiểm tra kết nối Drive.", 503);
  }
}
