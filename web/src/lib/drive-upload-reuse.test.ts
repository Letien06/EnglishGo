import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildReuseCandidates, validateReuseSourceFolder, validateReuseMetadata, verifyReuseChunk } from "../../scripts/lib/drive-upload-reuse.mjs";
const text = '{"unchanged":"nội dung"}';
const digest = createHash("sha256").update(text).digest("hex");
const source = { snapshotSha256: "a".repeat(64), folderId: "source_folder_123", manifestId: "source_manifest_123" };
const chunk = { fileId: "source_chunk_123", sha256: digest, bytes: Buffer.byteLength(text) };
function fixture() {
  return {
    manifest: { snapshotSha256: source.snapshotSha256, entries: { first: { chunks: [chunk] }, duplicate: { chunks: [chunk] } } },
    checkpoint: { ...source, accountEmail: "owner@example.test", complete: true, files: {
      [digest]: { fileId: chunk.fileId, verified: true },
      ["b".repeat(64)]: { fileId: source.manifestId, verified: true },
    } },
  };
}
const candidate = { ...chunk, source };
function metadata() {
  return { id: chunk.fileId, ownedByMe: true, mimeType: "text/plain", size: String(chunk.bytes), trashed: false,
    parents: [source.folderId], appProperties: { app: "englishwebapp-dauenglish", snapshot: source.snapshotSha256, sha256: digest },
    md5Checksum: createHash("md5").update(text).digest("hex") };
}
describe("safe immutable Drive chunk reuse", () => {
  it("reuses only exact prepared chunk hashes and deduplicates repeated material references", () => {
    const { manifest, checkpoint } = fixture();
    const candidates = buildReuseCandidates(manifest, checkpoint, checkpoint.accountEmail, new Set([digest]));
    expect(candidates.size).toBe(1);
    expect(candidates.get(digest)).toEqual(candidate);
    expect(buildReuseCandidates(manifest, checkpoint, checkpoint.accountEmail, new Set(["c".repeat(64)])).size).toBe(0);
  });
  it.each(["owner", "incomplete"] as const)("rejects an %s source checkpoint", (issue) => {
    const { manifest, checkpoint } = fixture();
    if (issue === "owner") checkpoint.accountEmail = "different@example.test";
    else checkpoint.complete = false;
    expect(() => buildReuseCandidates(manifest, checkpoint, "owner@example.test", new Set([digest]))).toThrow();
  });
  it("requires a verified source manifest and exact verified chunk identity", () => {
    const { manifest, checkpoint } = fixture();
    checkpoint.files[digest].fileId = "wrong_chunk_123";
    expect(() => buildReuseCandidates(manifest, checkpoint, checkpoint.accountEmail, new Set([digest]))).toThrow();
    checkpoint.files[digest].fileId = chunk.fileId;
    checkpoint.files["b".repeat(64)].verified = false;
    expect(() => buildReuseCandidates(manifest, checkpoint, checkpoint.accountEmail, new Set([digest]))).toThrow();
  });
  it("rejects conflicting hashes that name different files or sizes", () => {
    const { manifest, checkpoint } = fixture();
    manifest.entries.duplicate.chunks = [{ ...chunk, bytes: chunk.bytes + 1 }];
    expect(() => buildReuseCandidates(manifest, checkpoint, checkpoint.accountEmail, new Set([digest]))).toThrow(/Conflicting/);
  });
  it("retains original provenance across multiple reused snapshots", () => {
    const { manifest, checkpoint } = fixture();
    const original = { ...source, snapshotSha256: "d".repeat(64), folderId: "original_folder_123", manifestId: "original_manifest_123" };
    const files = { ...checkpoint.files, [digest]: { ...checkpoint.files[digest], reusedFrom: original } };
    expect(buildReuseCandidates(manifest, { ...checkpoint, files }, checkpoint.accountEmail, new Set([digest])).get(digest)?.source).toEqual(original);
  });
  it.each(["missing", "owner", "trashed", "mime", "parent", "snapshot", "app", "md5"] as const)("refuses %s remote metadata without reading or writing content", async (issue) => {
    const data = metadata();
    if (issue === "owner") data.ownedByMe = false;
    if (issue === "trashed") data.trashed = true;
    if (issue === "mime") data.mimeType = "application/json";
    if (issue === "parent") data.parents = ["wrong_folder_123"];
    if (issue === "snapshot") data.appProperties.snapshot = "e".repeat(64);
    if (issue === "app") data.appProperties.app = "other-app";
    if (issue === "md5") data.md5Checksum = "0".repeat(32);
    const client = { readText: vi.fn(), request: vi.fn() };
    await expect(verifyReuseChunk(client, issue === "missing" ? null : data, candidate, text)).rejects.toThrow();
    expect(client.readText).not.toHaveBeenCalled();
    expect(client.request).not.toHaveBeenCalled();
  });
  it("rejects mismatched byte sizes and expected hash despite compatible metadata", () => {
    expect(() => validateReuseMetadata(metadata(), { ...candidate, bytes: chunk.bytes + 1 }, text)).toThrow();
    expect(() => validateReuseMetadata(metadata(), { ...candidate, sha256: "f".repeat(64) }, text)).toThrow();
  });
  it("always reads remote bytes and checks SHA even when an older checkpoint claims verification", async () => {
    const client = { readText: vi.fn().mockResolvedValue(text), request: vi.fn() };
    await verifyReuseChunk(client, metadata(), candidate, text);
    expect(client.readText).toHaveBeenCalledWith(chunk.fileId, chunk.bytes, 120_000);
    expect(client.request).not.toHaveBeenCalled();
    client.readText.mockResolvedValue("changed content");
    await expect(verifyReuseChunk(client, metadata(), candidate, text)).rejects.toThrow(/checksum/);
  });
  it("verifies source folder ownership and provenance independently of chunk metadata", () => {
    const folder = { ownedByMe: true, mimeType: "application/vnd.google-apps.folder", trashed: false, appProperties: { app: "englishwebapp-dauenglish", snapshot: source.snapshotSha256 } };
    expect(() => validateReuseSourceFolder(folder, source)).not.toThrow();
    expect(() => validateReuseSourceFolder({ ...folder, ownedByMe: false }, source)).toThrow();
    expect(() => validateReuseSourceFolder({ ...folder, appProperties: { ...folder.appProperties, snapshot: "f".repeat(64) } }, source)).toThrow();
  });
});
