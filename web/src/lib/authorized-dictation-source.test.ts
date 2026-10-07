import { describe, expect, it } from "vitest";
import { createDictationCheckpoint, readDictationCheckpoint, fetchAuthorizedDictationRows, mapAuthorizedDictationRows, mergeAuthorizedDictationSnapshot } from "../../scripts/lib/authorized-dictation-source.mjs";

const source = { httpDate: "Thu, 08 Oct 2026 04:00:00 GMT", rows: {
  sets: [{ id: "set1", name: "Test", toeic_part: "part1", access_level: "pro", order_index: null, collection_name: "2026", chapter_name: "Test 1" }],
  items: [{ id: "item1", set_id: "set1", order_index: 1, audio_url: "https://example.com/audio.mp3", transcript: "Hello world.", translation_vi: "Xin chào" }],
  collections: [{ collection_name: "2026", order_index: 0 }], chapters: [{ collection_name: "2026", chapter_name: "Test 1", order_index: 0 }], stats: [{ set_id: "set1", item_count: 1 }],
} };
describe("authorized audio dictation import", () => {
  it("retains source IDs, Pro provenance, nullable ordering and all existing material", () => {
    const incoming = mapAuthorizedDictationRows(source);
    expect(incoming.catalog.sets[0]).toMatchObject({ id: "set1", accessLevel: "pro", orderIndex: null, itemCount: 1 });
    const existing = { key: "old", kind: "test", payload: { unchanged: true } };
    const merged = mergeAuthorizedDictationSnapshot({ materials: [existing] }, incoming);
    expect(merged.materials[0]).toBe(existing);
    expect(merged.materials[2].payload.items[0]).toMatchObject({ id: "item1", transcript: "Hello world." });
  });
  it("rejects missing items, duplicate IDs and unresolved audio", () => {
    expect(() => mapAuthorizedDictationRows({ ...source, rows: { ...source.rows, items: [] } })).toThrow(/Incomplete/);
    expect(() => mapAuthorizedDictationRows({ ...source, rows: { ...source.rows, items: [...source.rows.items, ...source.rows.items] } })).toThrow(/Duplicate/);
    expect(() => mapAuthorizedDictationRows({ ...source, rows: { ...source.rows, items: [{ ...source.rows.items[0], audio_url: "file.mp3" }] } })).toThrow();
  });
  it("preserves source chapter labels missing optional ordering metadata and excludes learner counts", () => {
    const mapped = mapAuthorizedDictationRows({ ...source, rows: { ...source.rows, chapters: [], stats: [{ set_id: "set1", item_count: 1, mastered_count: 1, completed_count: 1 }] } });
    expect(mapped.catalog.chapters).toEqual([{ collectionName: "2026", name: "Test 1", orderIndex: null }]);
    expect(JSON.stringify(mapped)).not.toMatch(/mastered_count|completed_count/);
  });
  it("marks a source item with an empty transcript explicitly without discarding audio", () => {
    const mapped = mapAuthorizedDictationRows({ ...source, rows: { ...source.rows, items: [{ ...source.rows.items[0], transcript: "" }] } });
    expect(mapped.sessions[0].items[0]).toMatchObject({ transcript: "", transcriptMissing: true, audioUrl: "https://example.com/audio.mp3" });
  });
  it("checks checkpoint integrity and base identity", () => {
    const checkpoint = createDictationCheckpoint("base", source);
    expect(readDictationCheckpoint(checkpoint, "base")).toEqual(source);
    expect(() => readDictationCheckpoint(checkpoint, "other")).toThrow();
    expect(() => readDictationCheckpoint({ ...checkpoint, rows: {} }, "base")).toThrow();
    expect(JSON.stringify(checkpoint)).not.toMatch(/accessToken|Authorization|email|sourceUser/);
  });
  it("paginates even when source page cap is below requested limit", async () => {
    const calls: { path: string; params?: Record<string, unknown> }[] = [];
    const client = { request: async (path: string, options: { params?: Record<string, unknown> }) => {
      calls.push({ path, params: options.params });
      const table = path.split("/").pop();
      const rows = table === "listening_sets" ? source.rows.sets : table === "listening_items" ? [source.rows.items[0], { ...source.rows.items[0], id: "item2" }] : table === "listening_collection_order" ? source.rows.collections : table === "listening_chapter_order" ? source.rows.chapters : source.rows.stats;
      const offset = Number(options.params?.offset || 0);
      return { data: rows.slice(offset, offset + 1), httpDate: source.httpDate, headers: new Headers({ "content-range": `0-0/${rows.length}` }) };
    } };
    const fetched = await fetchAuthorizedDictationRows(client);
    expect(fetched.rows.items).toHaveLength(2);
    expect(calls.filter(call => call.path.endsWith("listening_items")).map(call => call.params?.offset)).toEqual([0, 1]);
  });
  it("rejects changing source totals", async () => {
    let request = 0;
    const client = { request: async () => ({ data: [{ id: `set${++request}` }], httpDate: source.httpDate, headers: new Headers({ "content-range": `0-0/${request === 1 ? 2 : 3}` }) }) };
    await expect(fetchAuthorizedDictationRows(client)).rejects.toThrow(/count/);
  });
});
