import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
const storage = vi.hoisted(() => ({ readText: vi.fn(), readFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: storage.readFile, default: { readFile: storage.readFile } }));
vi.mock("../storage/google-drive", () => ({ createDriveClient: () => storage, driveFileId: (value: string) => value }));

let reader: typeof import("./dautoeic-drive");

const key = "dauenglish-v2__tests__all";
const text = JSON.stringify([{ id: "test", name: "Đề thi 🎧" }]);
const digest = createHash("sha256").update(text).digest("hex");

beforeEach(async () => {
  vi.resetModules();
  reader = await import("./dautoeic-drive");
  storage.readFile.mockReset().mockRejectedValue(Object.assign(new Error("Not bundled"), { code: "ENOENT" }));
  vi.stubEnv("DAUTOEIC_CONTENT_STORAGE", "google-drive");
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "token");
  vi.stubEnv("GOOGLE_DRIVE_MANIFEST_ID", "manifest_12345");
  storage.readText.mockReset();
  const manifest = { formatVersion: 1, source: "https://dauenglish.com", sourceVersion: "dauenglish-v2", snapshotSha256: digest, syncedAt: "2026-10-02T12:00:00.000Z", entries: { [key]: { kind: "tests", sha256: digest, bytes: Buffer.byteLength(text), chunks: [{ fileId: "chunk_1234567", sha256: digest, bytes: Buffer.byteLength(text) }] } } };
  storage.readText.mockImplementation(async (fileId: string) => fileId === "manifest_12345" ? JSON.stringify(manifest) : text);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("Drive material reader", () => {
  it("loads only the requested material and verifies checksums", async () => {
    expect(reader.isDriveContentEnabled()).toBe(true);
    await expect(reader.readDriveMaterial(key)).resolves.toEqual(JSON.parse(text));
    expect(storage.readText).toHaveBeenCalledTimes(2);
    expect(storage.readText).not.toHaveBeenCalledWith("materials.json", expect.anything());
  });

  it("does not serve corrupt material or silently fetch from the original source", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const normal = storage.readText.getMockImplementation()!;
    storage.readText.mockImplementation((fileId: string) => fileId === "chunk_1234567" ? Promise.resolve("corrupted") : normal(fileId));
    await expect(reader.readDriveMaterial(key)).rejects.toMatchObject({ status: 503 });
  });

  it("returns 404 for absent materials and isolates cache keys by manifest", async () => {
    await expect(reader.readDriveMaterial("dauenglish-v2__missing")).rejects.toMatchObject({ status: 404 });
    const first = reader.contentCacheKey();
    vi.stubEnv("GOOGLE_DRIVE_MANIFEST_ID", "manifest_new123");
    expect(reader.contentCacheKey()).not.toBe(first);
    vi.stubEnv("DAUTOEIC_CONTENT_STORAGE", "firestore");
    expect(reader.isDriveContentEnabled()).toBe(false);
    expect(reader.contentCacheKey()).toContain(":firestore:");
  });

  it("reads verified bundled content with no Drive request and returns isolated objects", async () => {
    const manifest = await storage.readText("manifest_12345");
    storage.readText.mockClear();
    storage.readFile.mockImplementation(async (file: string) => file.endsWith("manifest.json") ? manifest : gzipSync(text));
    const results = await Promise.all(Array.from({ length: 6 }, () => reader.readDriveMaterial<Array<{ name: string }>>(key)));
    results[0][0].name = "changed";
    expect(results[1]).toEqual(JSON.parse(text));
    expect(storage.readText).not.toHaveBeenCalled();
    expect(storage.readFile).toHaveBeenCalledTimes(2);
  });

  it("rejects a corrupted bundle instead of serving it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const manifest = await storage.readText("manifest_12345");
    storage.readText.mockClear();
    storage.readFile.mockImplementation(async (file: string) => file.endsWith("manifest.json") ? manifest : "corrupt");
    await expect(reader.readDriveMaterial(key)).rejects.toMatchObject({ status: 503 });
    expect(storage.readText).not.toHaveBeenCalled();
  });

  it("falls back to legacy JSON only when gzip is absent", async () => {
    const manifest = await storage.readText("manifest_12345");
    storage.readText.mockClear();
    storage.readFile.mockImplementation(async (file: string) => {
      if (file.endsWith("manifest.json")) return manifest;
      if (file.endsWith(".json.gz")) throw Object.assign(new Error("Missing"), { code: "ENOENT" });
      return text;
    });
    await expect(reader.readDriveMaterial(key)).resolves.toEqual(JSON.parse(text));
    expect(storage.readFile).toHaveBeenCalledTimes(3);
    expect(storage.readText).not.toHaveBeenCalled();
  });

  it("fails closed on valid gzip with a decoded checksum mismatch", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const manifest = await storage.readText("manifest_12345");
    storage.readText.mockClear();
    storage.readFile.mockImplementation(async (file: string) => file.endsWith("manifest.json") ? manifest : gzipSync("x".repeat(Buffer.byteLength(text))));
    await expect(reader.readDriveMaterial(key)).rejects.toMatchObject({ status: 503 });
    expect(storage.readFile).toHaveBeenCalledTimes(2);
    expect(storage.readText).not.toHaveBeenCalled();
  });

  it("does not reuse a material from another manifest", async () => {
    await reader.readDriveMaterial(key);
    vi.stubEnv("GOOGLE_DRIVE_MANIFEST_ID", "manifest_new123");
    const manifest = JSON.parse(await storage.readText("manifest_12345"));
    delete manifest.entries[key];
    manifest.entries["dauenglish-v2__other"] = { kind: "tests", sha256: digest, bytes: Buffer.byteLength(text), chunks: [{ fileId: "chunk_1234567", sha256: digest, bytes: Buffer.byteLength(text) }] };
    storage.readText.mockResolvedValue(JSON.stringify(manifest));
    await expect(reader.readDriveMaterial(key)).rejects.toMatchObject({ status: 404 });
  });
});
