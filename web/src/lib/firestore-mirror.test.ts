import { describe, expect, it } from "vitest";
import { mirrorDocuments } from "../../scripts/lib/firestore-mirror.mjs";

const metadata = { key: "dauenglish-v2__test", syncedAt: "2026-10-02T12:00:00Z" };

describe("application-compatible Firestore material chunks", () => {
  it("splits sessions by UTF-8 size and preserves every item", () => {
    const items = Array.from({ length: 100 }, (_, index) => ({ id: String(index), text: "Tiếng Việt 🎧".repeat(600) }));
    const documents = mirrorDocuments({ ...metadata, kind: "difficulty-session", payload: { total: items.length, items } }, "hash");
    const chunks = documents.slice(0, -1).map(({ data }) => {
      if (!("items" in data)) throw new Error("Expected an item chunk.");
      return data.items;
    });
    const root = documents.at(-1)!;
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.flat()).toEqual(items);
    expect(chunks.every((chunk) => Buffer.byteLength(JSON.stringify(chunk)) <= 450_000)).toBe(true);
    expect(root.data).toMatchObject({ itemCount: 100, chunkCount: chunks.length, payload: { total: 100 } });
  });

  it("preserves direct payloads and reconstructs large JSON exactly", () => {
    const small = { questions: [{ id: "question" }] };
    expect(mirrorDocuments({ ...metadata, kind: "test-part", payload: small }, "hash")[0].data).toMatchObject({ payload: small });
    const large = { text: "🎧".repeat(150_000) };
    const documents = mirrorDocuments({ ...metadata, kind: "test-part", payload: large }, "hash");
    expect(documents.at(-1)!.data).toMatchObject({ chunked: true });
    expect(JSON.parse(documents.slice(0, -1).map(({ data }) => "text" in data ? data.text : "").join(""))).toEqual(large);
  });

  it("rejects an individual oversize practice item before writing", () => {
    expect(() => mirrorDocuments({ ...metadata, kind: "difficulty-session", payload: { items: [{ id: "large", text: "a".repeat(450_000) }] } }, "hash")).toThrow("too large");
  });
});
