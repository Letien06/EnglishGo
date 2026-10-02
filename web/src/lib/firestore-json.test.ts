import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { archiveJson, splitJsonText } from "../../scripts/lib/firestore-json.mjs";

describe("Firestore JSON snapshot chunks", () => {
  it("limits UTF-8 bytes without corrupting Vietnamese or emoji", () => {
    const text = JSON.stringify({ text: "Tiếng Việt 🎧 đọc hiểu 😀".repeat(200) });
    const chunks = splitJsonText(text, 73);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => Buffer.byteLength(chunk, "utf8") <= 73)).toBe(true);
    expect(chunks.every((chunk) => Buffer.from(chunk, "utf8").toString("utf8") === chunk)).toBe(true);
    expect(chunks.join("")).toBe(text);
    expect(JSON.parse(chunks.join(""))).toEqual(JSON.parse(text));
  });

  it("handles exact boundaries and empty input", () => {
    expect(splitJsonText("abcdefgh", 4)).toEqual(["abcd", "efgh"]);
    expect(splitJsonText("🎧🎧", 4)).toEqual(["🎧", "🎧"]);
    expect(splitJsonText("")).toEqual([]);
  });

  it("rejects chunk limits that cannot fit complete characters", () => {
    expect(() => splitJsonText("text", 3)).toThrow("UTF-8");
  });
});

describe("verified Firestore JSON archive", () => {
  function fixture() {
    const stored = new Map<string, Record<string, unknown>>();
    type TestDoc = { path: string; get: () => Promise<{ exists: boolean; get: (field: string) => unknown; ref: { path: string } }>; collection: (name: string) => { doc: (id: string) => TestDoc } };
    const doc = (path: string): TestDoc => ({
      path,
      get: async () => snapshot(path),
      collection: (name: string) => ({ doc: (id: string) => doc(`${path}/${name}/${id}`) }),
    });
    const snapshot = (path: string) => ({ exists: stored.has(path), get: (field: string) => stored.get(path)?.[field], ref: { path } });
    const db = { doc, collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }), getAll: vi.fn(async (...refs: Array<{ path: string }>) => refs.map((ref) => snapshot(ref.path))) };
    const commit = vi.fn(async (documents: Array<{ path: string; data: Record<string, unknown>; merge?: boolean }>) => {
      for (const document of documents) stored.set(document.path, { ...(document.merge ? stored.get(document.path) : {}), ...document.data });
    });
    const json = JSON.stringify({ text: "Tiếng Việt 🎧".repeat(50_000) });
    const manifest = { sourceVersion: "test", sha256: createHash("sha256").update(json).digest("hex"), bytes: Buffer.byteLength(json), tests: 1, questions: 1, passages: 0, partCounts: [] };
    return { stored, db, commit, json, manifest };
  }

  it("verifies the entire reconstructed JSON before completion and can resume without rewriting", async () => {
    const { stored, db, commit, json, manifest } = fixture();
    const result = await archiveJson(db, manifest, json, 123, commit);
    expect(result.snapshotVerified).toBe(true);
    expect(stored.get(result.firestoreSnapshot)?.status).toBe("complete");
    const count = commit.mock.calls.length;
    await archiveJson(db, manifest, json, 123, commit);
    expect(commit).toHaveBeenCalledTimes(count);
  });

  it("does not certify an archive when read-back is corrupt", async () => {
    const { stored, db, commit, json, manifest } = fixture();
    db.getAll.mockImplementation(async (...refs) => refs.map((ref) => ({ exists: stored.has(ref.path), get: (field: string) => field === "text" ? "corrupt" : stored.get(ref.path)?.[field], ref: { path: ref.path } })));
    await expect(archiveJson(db, manifest, json, 123, commit)).rejects.toThrow("checksum failed");
    expect([...stored.values()].some((document) => document.status === "complete")).toBe(false);
  });

  it("propagates quota failures without marking anything complete", async () => {
    const { stored, db, commit, json, manifest } = fixture();
    commit.mockRejectedValue(new Error("RESOURCE_EXHAUSTED"));
    await expect(archiveJson(db, manifest, json, 123, commit)).rejects.toThrow("RESOURCE_EXHAUSTED");
    expect(stored.size).toBe(0);
  });
});
