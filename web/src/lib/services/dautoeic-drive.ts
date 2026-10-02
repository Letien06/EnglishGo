import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { serverEnv } from "../env";
import { ApiError } from "../api/response";
import { createDriveClient, driveFileId } from "../storage/google-drive";
import { driveManifestSchema } from "../storage/drive-manifest";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";

let configuredClient: { fingerprint: string; client: ReturnType<typeof createDriveClient> } | undefined;

export function isDriveContentEnabled(): boolean {
  return serverEnv.dauToeicContentStorage === "google-drive";
}

export function contentCacheKey(): string {
  return `${DAUTOEIC_SOURCE_VERSION}:${serverEnv.dauToeicContentStorage}:${isDriveContentEnabled() ? serverEnv.googleDriveManifestId : "legacy"}`;
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
    const manifest = await cachedManifest(driveFileId(serverEnv.googleDriveManifestId));
    const entry = manifest.entries[key];
    if (!entry) throw new ApiError("Không tìm thấy tài liệu trong bản Google Drive hiện tại.", 404);
    const chunks: string[] = [];
    for (let offset = 0; offset < entry.chunks.length; offset += 4) {
      chunks.push(...await Promise.all(entry.chunks.slice(offset, offset + 4).map((chunk) => cachedChunk(chunk.fileId, chunk.sha256, chunk.bytes))));
    }
    const text = chunks.join("");
    if (createHash("sha256").update(text).digest("hex") !== entry.sha256) throw new Error("Drive material checksum mismatch.");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[dauenglish-drive]", error instanceof Error ? error.message : "Unable to read material");
    throw new ApiError("Chưa đọc được tài liệu từ Google Drive. Vui lòng thử lại hoặc kiểm tra kết nối Drive.", 503);
  }
}
