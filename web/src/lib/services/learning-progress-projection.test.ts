import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), reads: 0, writes: 0, queries: 0, transactions: 0, queryPaths: [] as string[], log: vi.fn(), beforeTransaction: undefined as (() => void) | undefined, retryOnce: undefined as (() => void) | undefined }));
vi.mock("../logging", () => ({ logInfo: state.log }));
type Ref = { path: string; field?: string; value?: unknown; op?: string; doc: (id: string) => Ref; collection: (name: string) => Ref; where: (field: string | object, op: string, value: unknown) => Ref; get: () => Promise<unknown> };
function ref(path: string, field?: string, value?: unknown, op?: string): Ref {
  return { path, field, value, op, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`), where: (key, operator, target) => ref(path, typeof key === "string" ? key : "__name__", target, operator), get: async () => snapshot(ref(path, field, value, op)) };
}
function snapshot(reference: Ref) {
  if (reference.field) {
    state.queries++;
    state.queryPaths.push(reference.path);
    const docs = [...state.docs].filter(([key, data]) => {
      const id = key.slice(reference.path.length + 1);
      const value = reference.field === "__name__" ? id : data[reference.field!];
      return key.startsWith(`${reference.path}/`) && !id.includes("/") && (reference.op === "in" ? (reference.value as unknown[]).includes(value) : value === reference.value);
    }).map(([key, data]) => ({ id: key.split("/").at(-1), data: () => data, ref: ref(key) }));
    state.reads += Math.max(1, docs.length);
    return { docs };
  }
  state.reads++;
  return { exists: state.docs.has(reference.path), data: () => state.docs.get(reference.path) };
}
vi.mock("../firestore/db", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    state.beforeTransaction?.();
    while (true) {
      state.transactions++;
      const writes: [Ref, Record<string, unknown> | null][] = [];
      const result = await callback({ get: async (reference: Ref) => snapshot(reference), set: (reference: Ref, data: Record<string, unknown>) => writes.push([reference, data]), delete: (reference: Ref) => writes.push([reference, null]) });
      if (state.retryOnce) { const retry = state.retryOnce; state.retryOnce = undefined; retry(); continue; }
      for (const [reference, data] of writes) { if (data) state.docs.set(reference.path, data); else state.docs.delete(reference.path); state.writes++; }
      return result;
    }
  },
} }));
import { learningProgressProjectionShard, prepareLearningProgressProjection, prepareLearningProgressProjectionReset, readLearningProgressProjection } from "./learning-progress-projection";

beforeEach(() => { state.docs.clear(); state.reads = 0; state.writes = 0; state.queries = 0; state.transactions = 0; state.queryPaths = []; state.log.mockClear(); state.beforeTransaction = undefined; state.retryOnce = undefined; });
afterEach(() => { vi.unstubAllEnvs(); });
function progress(index: number, extra: Record<string, unknown> = {}) { return { part: 7, questionId: `q${index}`, itemId: `passage${Math.floor(index / 4)}`, selectedAnswer: "A", correct: index % 2 === 0, ...extra }; }
function seedShards(count: number) {
  for (const key of state.docs.keys()) if (key.startsWith("users/u/readingProgressCatalog/")) state.docs.delete(key);
  const directory = new Set<string>();
  for (let index = 0; index < count; index++) {
    const row = progress(index);
    const shard = learningProgressProjectionShard("u", "readingProgress", 7, row.questionId);
    directory.add(shard.path.split("/").at(-1)!);
    const rows = state.docs.get(shard.path)?.rows as Record<string, unknown> ?? {};
    rows[row.questionId] = row;
    state.docs.set(shard.path, { part: 7, rows });
  }
  state.docs.set("users/u/readingProgressCatalog/7-index", { schema: 2, ready: true, empty: false, shards: [...directory] });
}

describe("catalog progress projection", () => {
  it("compacts a compatible twelve-answer projection without scanning source, then reads it in one query", async () => {
    seedShards(12);
    state.docs.set("users/u/readingProgress/foreign", progress(999));
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(12);
    expect(state.queryPaths.every((path) => path === "users/u/readingProgressCatalog")).toBe(true);
    expect(state.docs.get("users/u/readingProgressCatalog/7-index")?.inlineRows).toBeDefined();
    expect([...state.docs.keys()].filter((key) => /readingProgressCatalog\/7-\d+$/.test(key))).toHaveLength(0);
    state.reads = 0; state.queries = 0; state.transactions = 0;
    vi.stubEnv("NODE_ENV", "production");
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(12);
    expect(state.reads).toBe(1);
    expect(state.queries).toBe(1);
    expect(state.transactions).toBe(0);
    expect(state.log).toHaveBeenLastCalledWith("learning_progress_catalog_read", expect.objectContaining({ strategy: "inline", documentReads: 1, readQueryCount: 1, transactionAttempts: 0 }));
  });
  it("rechecks concurrent growth before compaction and keeps all sixty-five answers", async () => {
    seedShards(64);
    state.beforeTransaction = () => seedShards(65);
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(65);
    expect(state.writes).toBe(0);
    expect(state.docs.get("users/u/readingProgressCatalog/7-index")?.inlineRows).toBeUndefined();
    expect(state.queryPaths.every((path) => path === "users/u/readingProgressCatalog")).toBe(true);
  });
  it("discards conflicted compaction writes and counts retried transaction queries", async () => {
    vi.stubEnv("NODE_ENV", "production");
    seedShards(64);
    state.retryOnce = () => seedShards(65);
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(65);
    expect(state.writes).toBe(0);
    expect(state.transactions).toBe(2);
    expect(state.queries).toBe(3);
    expect(state.log).toHaveBeenLastCalledWith("learning_progress_catalog_read", expect.objectContaining({ documentReads: state.reads, readQueryCount: 3, transactionAttempts: 2, returnedCount: 65 }));
  });
  it.each(["missing", "unknown", "duplicates"])("rebuilds a %s directory from source instead of returning partial answers", async (corruption) => {
    seedShards(12);
    const meta = state.docs.get("users/u/readingProgressCatalog/7-index")!;
    const directory = meta.shards as string[];
    meta.shards = corruption === "missing" ? directory.slice(1) : corruption === "unknown" ? [...directory, "7-99"] : [...directory, directory[0]];
    state.docs.set("users/u/readingProgress/q100", progress(100));
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([progress(100)]);
    expect(state.queryPaths).toContain("users/u/readingProgress");
  });
  it("migrates legacy history once and reduces warm catalog reads from 1080 to 17", async () => {
    for (let index = 0; index < 1080; index++) state.docs.set(`users/u/readingProgress/q${index}`, progress(index));
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(1080);
    expect(state.reads).toBe(1082);
    expect(state.writes).toBe(17);
    state.reads = 0; state.writes = 0; state.queries = 0; state.transactions = 0;
    const rows = await readLearningProgressProjection("u", "readingProgress", 7);
    expect(rows).toHaveLength(1080);
    expect(rows.filter((row) => row.correct)).toHaveLength(540);
    expect(state.reads).toBe(17);
    expect(state.writes).toBe(0);
    expect(state.queries).toBe(1);
    expect(state.transactions).toBe(0);
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
  it("uses bounded shards when a small row count exceeds the inline byte budget", async () => {
    const firstShard = learningProgressProjectionShard("u", "readingProgress", 7, "q0").path;
    let second = 1;
    while (learningProgressProjectionShard("u", "readingProgress", 7, `q${second}`).path === firstShard) second++;
    state.docs.set("users/u/readingProgress/q0", progress(0, { itemId: "a".repeat(350_000) }));
    state.docs.set(`users/u/readingProgress/q${second}`, progress(second, { itemId: "b".repeat(350_000) }));
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(2);
    expect(state.docs.get("users/u/readingProgressCatalog/7-index")?.inlineRows).toBeUndefined();
    state.reads = 0; state.transactions = 0; state.queries = 0;
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(2);
    expect(state.reads).toBe(3);
    expect(state.transactions).toBe(0);
    expect(state.queries).toBe(1);
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
    for (let index = 0; index < 64; index++) state.docs.set(`users/u/readingProgress/q${index}`, progress(index));
    await readLearningProgressProjection("u", "readingProgress", 7);
    expect(state.docs.get("users/u/readingProgressCatalog/7-index")?.inlineRows).toBeDefined();
    const mutate = async (prepare: (tx: FirebaseFirestore.Transaction) => Promise<() => void>) => {
      const writes: [Ref, Record<string, unknown> | null][] = [];
      const tx = { get: async (reference: Ref) => snapshot(reference), set: (reference: Ref, data: Record<string, unknown>) => writes.push([reference, data]), delete: (reference: Ref) => writes.push([reference, null]) };
      (await prepare(tx as unknown as FirebaseFirestore.Transaction))();
      for (const [reference, data] of writes) { if (data) state.docs.set(reference.path, data); else state.docs.delete(reference.path); }
    };
    await mutate((tx) => prepareLearningProgressProjection(tx, "u", "readingProgress", progress(64)));
    expect(state.docs.get("users/u/readingProgressCatalog/7-index")?.inlineRows).toBeUndefined();
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toHaveLength(65);
    await mutate((tx) => prepareLearningProgressProjectionReset(tx, "u", "readingProgress", 7, Array.from({ length: 65 }, (_, index) => `q${index}`)));
    expect([...state.docs.keys()].filter((key) => /readingProgressCatalog\/7-\d+$/.test(key))).toHaveLength(0);
    state.reads = 0;
    expect(await readLearningProgressProjection("u", "readingProgress", 7)).toEqual([]);
    expect(state.reads).toBe(1);
  });
});
