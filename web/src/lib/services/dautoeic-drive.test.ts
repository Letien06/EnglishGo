import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
const storage = vi.hoisted(() => ({ readText: vi.fn() }));
vi.mock("../storage/google-drive", () => ({ createDriveClient: () => storage, driveFileId: (value: string) => value }));

import { contentCacheKey, isDriveContentEnabled, readDriveMaterial } from "./dautoeic-drive";

const key = "dauenglish-v2__tests__all";
const text = JSON.stringify([{ id: "test", name: "Đề thi 🎧" }]);
const digest = createHash("sha256").update(text).digest("hex");

beforeEach(() => {
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
    expect(isDriveContentEnabled()).toBe(true);
    await expect(readDriveMaterial(key)).resolves.toEqual(JSON.parse(text));
    expect(storage.readText).toHaveBeenCalledTimes(2);
    expect(storage.readText).not.toHaveBeenCalledWith("materials.json", expect.anything());
  });

  it("does not serve corrupt material or silently fetch from the original source", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const normal = storage.readText.getMockImplementation()!;
    storage.readText.mockImplementation((fileId: string) => fileId === "chunk_1234567" ? Promise.resolve("corrupted") : normal(fileId));
    await expect(readDriveMaterial(key)).rejects.toMatchObject({ status: 503 });
  });

  it("returns 404 for absent materials and isolates cache keys by manifest", async () => {
    await expect(readDriveMaterial("dauenglish-v2__missing")).rejects.toMatchObject({ status: 404 });
    const first = contentCacheKey();
    vi.stubEnv("GOOGLE_DRIVE_MANIFEST_ID", "manifest_new123");
    expect(contentCacheKey()).not.toBe(first);
    vi.stubEnv("DAUTOEIC_CONTENT_STORAGE", "firestore");
    expect(isDriveContentEnabled()).toBe(false);
    expect(contentCacheKey()).toContain(":firestore:");
  });
});
