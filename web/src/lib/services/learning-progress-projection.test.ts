import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), reads: 0, writes: 0 }));
type Ref = { path: string; field?: string; value?: unknown; doc: (id: string) => Ref; collection: (name: string) => Ref; where: (field: string, op: string, value: unknown) => Ref };
function ref(path: string, field?: string, value?: unknown): Ref {
  return { path, field, value, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`), where: (key, _op, target) => ref(path, key, target) };
}
function snapshot(reference: Ref) {
  if (reference.field) {
    const docs = [...state.docs].filter(([key, data]) => key.startsWith(`${reference.path}/`) && !key.slice(reference.path.length + 1).includes("/") && data[reference.field!] === reference.value).map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data, ref: ref(key) }));
    state.reads += Math.max(1, docs.length);
    return { docs };
  }
  state.reads++;
  return { exists: state.docs.has(reference.path), data: () => state.docs.get(reference.path) };
}
vi.mock("../firestore/db", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const writes: [Ref, Record<string, unknown> | null][] = [];
    const result = await callback({ get: async (reference: Ref) => snapshot(reference), set: (reference: Ref, data: Record<string, unknown>) => writes.push([reference, data]), delete: (reference: Ref) => writes.push([reference, null]) });
    for (const [reference, data] of writes) { if (data) state.docs.set(reference.path, data); else state.docs.delete(reference.path); state.writes++; }
    return result;
  },
} }));
import { learningProgressProjectionShard, prepareLearningProgressProjection, prepareLearningProgressProjectionReset, readLearningProgressProjection } from "./learning-progress-projection";

beforeEach(() => { state.docs.clear(); state.reads = 0; state.writes = 0; });
function progress(index: number, extra: Record<string, unknown> = {}) { return { part: 7, questionId: `q${index}`, itemId: `passage${Math.floor(index / 4)}`, selectedAnswer: "A", correct: index % 2 === 0, ...extra }; }

describe("catalog progress projection", () => {
  it("migrates legacy history once and reduces warm catalog reads from 1080 to 17", async () => {
    for (let index = 0; index < 1080; index++) state.docs.set(`users/u/readingProgress/q${index}`, progress(index));
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(1080);
    expect(state.reads).toBe(1082);
    expect(state.writes).toBe(17);
    state.reads = 0; state.writes = 0;
    const rows = await readLearningProgressProjection("u", "readingProgress", 7);
    expect(rows).toHaveLength(1080);
    expect(rows.filter((row) => row.correct)).toHaveLength(540);
    expect(state.reads).toBe(17);
    expect(state.writes).toBe(0);
  });
  it("prepares reads before writes and replaces answers without double counting", async () => {
    state.docs.set("users/u/readingProgress/q0", progress(0));
    await readLearningProgressProjection("u", "readingProgress", 7);
    const writes: [Ref, Record<string, unknown>][] = [];
    const tx = { get: async (reference: Ref) => snapshot(reference), set: (reference: Ref, data: Record<string, unknown>) => writes.push([reference, data]) };
    const save = await prepareLearningProgressProjection(tx as unknown as FirebaseFirestore.Transaction, "u", "readingProgress", progress(0, { selectedAnswer: "B", correct: false }));
    expect(writes).toHaveLength(0);
    save();
    for (const [reference, data] of writes) state.docs.set(reference.path, data);
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([progress(0, { selectedAnswer: "B", correct: false })]);
  });
  it("leaves legacy users for transactional migration and separates learners and modules", async () => {
    const writes = vi.fn();
    const tx = { get: async (reference: Ref) => snapshot(reference), set: writes };
    const save = await prepareLearningProgressProjection(tx as unknown as FirebaseFirestore.Transaction, "u", "readingProgress", progress(0));
    save();
    expect(writes).not.toHaveBeenCalled();
    expect(learningProgressProjectionShard("u", "readingProgress", 7, "q0").path).not.toBe(learningProgressProjectionShard("other", "readingProgress", 7, "q0").path);
    expect(learningProgressProjectionShard("u", "readingProgress", 7, "q0").path).not.toBe(learningProgressProjectionShard("u", "listeningProgress", 7, "q0").path);
  });
  it("falls back to source history instead of writing an oversized projection shard", async () => {
    state.docs.set("users/u/readingProgress/q0", progress(0, { itemId: "x".repeat(650_000) }));
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(1);
    expect(state.writes).toBe(0);
    expect(state.docs.has("users/u/readingProgressCatalog/7-index")).toBe(false);
  });
  it("invalidates readiness when a new answer would exceed the projection bound", async () => {
    state.docs.set("users/u/readingProgressCatalog/7-index", { ready: true, schema: 2, empty: true, shards: [] });
    const writes: [Ref, Record<string, unknown>][] = [];
    const tx = { get: async (reference: Ref) => snapshot(reference), set: (reference: Ref, data: Record<string, unknown>) => writes.push([reference, data]) };
    const save = await prepareLearningProgressProjection(tx as unknown as FirebaseFirestore.Transaction, "u", "readingProgress", progress(0, { itemId: "x".repeat(650_000) }));
    save();
    expect(writes).toEqual([[expect.objectContaining({ path: "users/u/readingProgressCatalog/7-index" }), { schema: 2, ready: false }]]);
  });
  it("stores no empty shard documents and reads only metadata for a warm empty history", async () => {
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([]);
    expect([...state.docs.keys()]).toEqual(["users/u/readingProgressCatalog/7-index"]);
    state.reads = 0;
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([]);
    expect(state.reads).toBe(1);
  });
  it("reads only populated buckets for a warm three-row history", async () => {
    for (let index = 0; index < 3; index++) state.docs.set(`users/u/readingProgress/q${index}`, progress(index));
    await readLearningProgressProjection("u", "readingProgress", 7);
    const shardCount = [...state.docs.keys()].filter((key) => /readingProgressCatalog\/7-\d+$/.test(key)).length;
    expect(shardCount).toBeLessThanOrEqual(3);
    state.reads = 0;
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(3);
    expect(state.reads).toBe(1 + shardCount);
    expect(state.reads).toBeLessThanOrEqual(4);
  });
  it("cleans stale and empty shards when migrating an older projection schema", async () => {
    state.docs.set("users/u/readingProgressCatalog/7-index", { ready: true, schema: 1 });
    state.docs.set("users/u/readingProgressCatalog/7-0", { part: 7, rows: { retired: progress(100) } });
    state.docs.set("users/u/readingProgressCatalog/7-1", { part: 7, rows: {} });
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([]);
    expect([...state.docs.keys()]).toEqual(["users/u/readingProgressCatalog/7-index"]);
  });
  it("flips empty metadata on the first answer and removes the last shard on reset", async () => {
    await readLearningProgressProjection("u", "readingProgress", 7);
    const mutate = async (prepare: (tx: FirebaseFirestore.Transaction) => Promise<() => void>) => {
      const writes: [Ref, Record<string, unknown> | null][] = [];
      const tx = { get: async (reference: Ref) => snapshot(reference), set: (reference: Ref, data: Record<string, unknown>) => writes.push([reference, data]), delete: (reference: Ref) => writes.push([reference, null]) };
      (await prepare(tx as unknown as FirebaseFirestore.Transaction))();
      for (const [reference, data] of writes) { if (data) state.docs.set(reference.path, data); else state.docs.delete(reference.path); }
    };
    await mutate((tx) => prepareLearningProgressProjection(tx, "u", "readingProgress", progress(0)));
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(1);
    await mutate((tx) => prepareLearningProgressProjectionReset(tx, "u", "readingProgress", 7, ["q0"]));
    state.reads = 0;
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([]);
    expect(state.reads).toBe(1);
    expect([...state.docs.keys()]).toEqual(["users/u/readingProgressCatalog/7-index"]);
  });
  it("moves bounded inline rows into populated shards and deletes all shards after a full reset", async () => {
    for (let index = 0; index < 8; index++) state.docs.set(`users/u/readingProgress/q${index}`, progress(index));
    await readLearningProgressProjection("u", "readingProgress", 7);
    expect(state.docs.get("users/u/readingProgressCatalog/7-index")?.inlineRows).toBeDefined();
    const mutate = async (prepare: (tx: FirebaseFirestore.Transaction) => Promise<() => void>) => {
      const writes: [Ref, Record<string, unknown> | null][] = [];
      const tx = { get: async (reference: Ref) => snapshot(reference), set: (reference: Ref, data: Record<string, unknown>) => writes.push([reference, data]), delete: (reference: Ref) => writes.push([reference, null]) };
      (await prepare(tx as unknown as FirebaseFirestore.Transaction))();
      for (const [reference, data] of writes) { if (data) state.docs.set(reference.path, data); else state.docs.delete(reference.path); }
    };
    await mutate((tx) => prepareLearningProgressProjection(tx, "u", "readingProgress", progress(8)));
    expect(state.docs.get("users/u/readingProgressCatalog/7-index")?.inlineRows).toBeUndefined();
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(9);
    await mutate((tx) => prepareLearningProgressProjectionReset(tx, "u", "readingProgress", 7, Array.from({ length: 9 }, (_, index) => `q${index}`)));
    expect([...state.docs.keys()].filter((key) => /readingProgressCatalog\/7-\d+$/.test(key))).toHaveLength(0);
    state.reads = 0;
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([]);
    expect(state.reads).toBe(1);
  });
});
