import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeFirestoreWrite } from "@/test/firestore-merge";
import { FieldValue } from "firebase-admin/firestore";

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), failCommit: false, retry: false, writes: vi.fn(), reads: vi.fn(), tail: Promise.resolve() }));
type Query = { path: string; field: unknown; value: unknown; get: () => Promise<ReturnType<typeof querySnapshot>> };
type Ref = { path: string; doc: (id: string) => Ref; collection: (name: string) => Ref; where: (field: unknown, operator: string, value: unknown) => Query; get: () => Promise<ReturnType<typeof snapshot>> };
function ref(path: string): Ref {
  const reference: Ref = { path, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`),
    where: (field, _operator, value) => { const query: Query = { path, field, value, get: async () => querySnapshot(query) }; return query; },
    get: async () => snapshot(reference) };
  return reference;
}
function querySnapshot(query: Query) {
  const docs = [...state.docs.entries()].filter(([path, data]) => {
    if (!path.startsWith(`${query.path}/`) || path.slice(query.path.length + 1).includes("/")) return false;
    return query.field === "part" ? data.part === query.value : (query.value as string[]).includes(path.slice(query.path.length + 1));
  }).map(([path, data]) => ({ id: path.slice(query.path.length + 1), ref: ref(path), data: () => data }));
  return { docs, empty: docs.length === 0, size: docs.length };
}
function snapshot(reference: Ref) {
  const data = state.docs.get(reference.path);
  return { exists: data !== undefined, data: () => data };
}
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: (callback: (tx: unknown) => Promise<unknown>) => {
    const execute = async () => {
      const run = async (commit: boolean) => {
        const staged: [Ref, Record<string, unknown> | null, boolean][] = [];
        const result = await callback({
          get: async (reference: Ref | Query) => {
            if (staged.length) throw new Error("Read after write");
            state.reads(reference.path);
            return "field" in reference ? querySnapshot(reference) : snapshot(reference);
          },
          set: (reference: Ref, data: Record<string, unknown>, options?: { merge: boolean }) => staged.push([reference, data, options?.merge === true]),
          delete: (reference: Ref) => staged.push([reference, null, false]),
        });
        if (state.failCommit) throw new Error("Commit failed");
        if (commit) for (const [reference, data, merge] of staged) {
          state.writes(reference.path);
          if (data === null) state.docs.delete(reference.path);
          else state.docs.set(reference.path, mergeFirestoreWrite(merge ? state.docs.get(reference.path) ?? {} : {}, data));
        }
        return result;
      };
      if (state.retry) await run(false);
      return run(true);
    };
    const result = state.tail.then(execute);
    state.tail = result.then(() => undefined, () => undefined);
    return result;
  },
} }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("./learner-cache", () => ({ invalidateLearnerActivityCaches: vi.fn(), studyStreakCacheTag: vi.fn(), STUDY_STREAK_LEADERBOARD_CACHE_TAG: "streak" }));
import { saveLearningProgress, type LearningProgressData } from "./learning-progress-save";
import { learningProgressProjectionShard, prepareLearningProgressProjection, prepareLearningProgressProjectionReset, readLearningProgressProjection } from "./learning-progress-projection";
import { adminDb } from "@/lib/firestore/db";
import type { ProgressRequest } from "@/types/listening";

const firstId = "123e4567-e89b-42d3-a456-426614174000";
const secondId = "123e4567-e89b-42d3-a456-426614174001";
const now = Date.parse("2026-10-07T10:00:00Z");
const request: ProgressRequest = { requestId: firstId, expectedUid: "learner", part: 5, level: 3, itemId: "item", questionId: "question", selectedAnswer: "A", correctAnswer: "A", modeUsed: "normal", assistPercent: 0, replayCount: 0, elapsedSeconds: 15 };
function save(overrides: Partial<ProgressRequest> = {}, module: "reading" | "listening" = "reading", resolve = vi.fn()) {
  const body = { ...request, ...overrides };
  const progressCollection = `${module}Progress`;
  return saveLearningProgress({ uid: "learner", module, progressCollection, request: body,
    resolveProgress: async () => {
      resolve();
      return { part: body.part!, sourceLevel: 3, itemId: body.itemId!, questionId: body.questionId!, selectedAnswer: body.selectedAnswer, correct: body.selectedAnswer === "A", elapsedSeconds: 15, completedAtMillis: now,
        requestId: body.requestId ?? FieldValue.delete(),
        answeredAtMillis: body.answeredAtMillis ?? FieldValue.delete(),
      } as LearningProgressData;
    },
    prepareProjection: (tx, data) => prepareLearningProgressProjection(tx, "learner", progressCollection, data),
  });
}
const userPath = "users/learner";
const boardPath = "leaderboards/reading_all_time/entries/learner";
beforeEach(() => {
  vi.clearAllMocks(); state.docs.clear(); state.failCommit = false; state.retry = false; state.tail = Promise.resolve();
  state.docs.set(`${userPath}/readingProgressCatalog/5-index`, { schema: 2, ready: true, shards: [] });
});

describe("atomic reading progress retry accounting", () => {
  function seedInline(count: number) {
    const rows = Object.fromEntries(Array.from({ length: count }, (_, index) => [`q${index}`, { questionId: `q${index}`, itemId: `item${index}`, part: 5, selectedAnswer: "B", correct: false }]));
    state.docs.set(`${userPath}/readingProgressCatalog/5-index`, { schema: 2, ready: true, empty: false, shards: [], inlineRows: rows });
    for (const [id, row] of Object.entries(rows)) state.docs.set(`${userPath}/readingProgress/${id}`, row);
    return rows;
  }

  it("commits the 64-inline to 65-shard transition with answer and accounting, preserving late/replayed events", async () => {
    seedInline(64);
    const latest = { questionId: "q64", itemId: "item64", requestId: secondId, selectedAnswer: "B", answeredAtMillis: now + 1 };
    await save(latest);
    const metadata = state.docs.get(`${userPath}/readingProgressCatalog/5-index`)!;
    expect(metadata).not.toHaveProperty("inlineRows");
    expect(metadata).toMatchObject({ schema: 2, ready: true, empty: false });
    const shards = metadata.shards as string[];
    const allRows = Object.assign({}, ...shards.map((id) => state.docs.get(`${userPath}/readingProgressCatalog/${id}`)!.rows));
    expect(Object.keys(allRows)).toHaveLength(65);
    expect(allRows.q64).toMatchObject({ selectedAnswer: "B", correct: false });
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyMetrics: { reading: 1 } });
    await save({ questionId: "q64", itemId: "item64", answeredAtMillis: now });
    await save(latest);
    expect(state.docs.get(`${userPath}/readingProgress/q64`)).toMatchObject({ selectedAnswer: "B", requestId: secondId });
    const shard = learningProgressProjectionShard("learner", "readingProgress", 5, "q64");
    expect(state.docs.get(shard.path)).toMatchObject({ rows: { q64: { selectedAnswer: "B", correct: false } } });
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 20, totalStudyMetrics: { reading: 2 } });
  });

  it("rolls back every shard, source answer and receipt when the inline transition fails", async () => {
    const inlineRows = seedInline(64);
    const before = new Map(state.docs);
    state.failCommit = true;
    await expect(save({ questionId: "q64", itemId: "item64" })).rejects.toThrow("Commit failed");
    expect(state.docs).toEqual(before);
    expect(state.docs.get(`${userPath}/readingProgressCatalog/5-index`)).toMatchObject({ inlineRows, shards: [] });
    state.failCommit = false; state.retry = true;
    await save({ questionId: "q64", itemId: "item64" });
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 10, totalStudyMetrics: { reading: 1 } });
    expect(state.docs.has(`${userPath}/readingProgressRequests/${firstId}`)).toBe(true);
  });

  it("preserves a reset across sharded-to-inline compaction and subsequent answer/receipt saves", async () => {
    seedInline(64);
    await save({ questionId: "q64", itemId: "item64", answeredAtMillis: now });
    await adminDb.runTransaction(async (tx) => {
      const writeReset = await prepareLearningProgressProjectionReset(tx, "learner", "readingProgress", 5, ["q0", "q1"]);
      tx.delete(adminDb.collection("users").doc("learner").collection("readingProgress").doc("q0"));
      tx.delete(adminDb.collection("users").doc("learner").collection("readingProgress").doc("q1"));
      writeReset();
    });
    const rows = await readLearningProgressProjection("learner", "readingProgress", 5);
    expect(rows).toHaveLength(63);
    expect(rows.some((row) => row.questionId === "q0" || row.questionId === "q1")).toBe(false);
    expect(state.docs.get(`${userPath}/readingProgressCatalog/5-index`)).toMatchObject({ shards: [], inlineRows: { q64: { selectedAnswer: "A" } } });
    await save({ questionId: "q64", itemId: "item64", requestId: secondId, selectedAnswer: "B", answeredAtMillis: now + 1 });
    await save({ questionId: "q64", itemId: "item64", answeredAtMillis: now });
    const after = await readLearningProgressProjection("learner", "readingProgress", 5);
    expect(after).toHaveLength(63);
    expect(after.find((row) => row.questionId === "q64")).toMatchObject({ selectedAnswer: "B", correct: false });
    expect(state.docs.has(`${userPath}/readingProgress/q0`)).toBe(false);
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyMetrics: { reading: 2 } });
  });

  it("concurrent duplicate requests award once and replay the exact acknowledgement", async () => {
    const [one, two] = await Promise.all([save(), save()]);
    expect(one).toEqual({ saved: true, authenticated: true, correct: true, requestId: firstId, uid: "learner" });
    expect(two).toEqual(one);
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 10, totalStudyMetrics: { reading: 1, studySeconds: 15 }, studyTodayActivityCount: 1, studyStreakDays: 1 });
    expect(state.docs.get(`${userPath}/dailySummaries/2026-10-07`)).toMatchObject({ totalActivityCount: 1, xp: 10 });
    expect(state.docs.get(boardPath)).toMatchObject({ score: 30, correctCount: 1 });
    expect(state.docs.get("leaderboards/reading_weekly_2026-W41/entries/learner")).toMatchObject({ score: 30, weekKey: "2026-W41" });
    const writes = state.writes.mock.calls.length;
    const resolve = vi.fn(() => { throw new Error("Catalog unavailable"); });
    expect(await save({}, "reading", resolve)).toEqual(one);
    expect(resolve).not.toHaveBeenCalled(); expect(state.writes).toHaveBeenCalledTimes(writes);
  });

  it("late retry cannot overwrite a newer answer or projection and changed token payload conflicts", async () => {
    await save();
    await save({ requestId: secondId, selectedAnswer: "B" });
    expect(await save()).toMatchObject({ correct: true });
    expect(state.docs.get(`${userPath}/readingProgress/question`)).toMatchObject({ selectedAnswer: "B", correct: false });
    const projection = learningProgressProjectionShard("learner", "readingProgress", 5, "question");
    expect(state.docs.get(projection.path)).toMatchObject({ rows: { question: { selectedAnswer: "B", correct: false } } });
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyMetrics: { reading: 2 }, studyTodayActivityCount: 2 });
    await expect(save({ selectedAnswer: "B" })).rejects.toMatchObject({ status: 409 });
  });

  it("failed commit saves no partial effects and callback retries commit once", async () => {
    state.failCommit = true;
    await expect(save()).rejects.toThrow("Commit failed");
    expect(state.docs.size).toBe(1); expect(state.writes).not.toHaveBeenCalled();
    state.failCommit = false; state.retry = true;
    await save();
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 10, totalStudyMetrics: { reading: 1 } });
    expect(state.docs.has(`${userPath}/readingProgressRequests/${firstId}`)).toBe(true);
    expect(state.docs.get(boardPath)).toMatchObject({ score: 30 });
  });

  it("keeps newer progress when an older offline answer first arrives later, accounting each event once", async () => {
    await save({ requestId: secondId, selectedAnswer: "B", answeredAtMillis: now + 1000 });
    const older = await save({ answeredAtMillis: now });
    expect(older).toMatchObject({ correct: true, requestId: firstId });
    expect(state.docs.get(`${userPath}/readingProgress/question`)).toMatchObject({ selectedAnswer: "B", correct: false, requestId: secondId, answeredAtMillis: now + 1000 });
    const projection = learningProgressProjectionShard("learner", "readingProgress", 5, "question");
    expect(state.docs.get(projection.path)).toMatchObject({ rows: { question: { selectedAnswer: "B", correct: false } } });
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 20, totalStudyMetrics: { reading: 2 } });
    expect(await save({ answeredAtMillis: now })).toEqual(older);
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 20, totalStudyMetrics: { reading: 2 } });
    await expect(save({ answeredAtMillis: now + 1 })).rejects.toMatchObject({ status: 409 });
  });

  it("orders timestamp ties by request ID and accepts a later answer", async () => {
    await save({ requestId: secondId, selectedAnswer: "B", answeredAtMillis: now });
    await save({ answeredAtMillis: now });
    expect(state.docs.get(`${userPath}/readingProgress/question`)).toMatchObject({ selectedAnswer: "B" });
    await save({ requestId: "123e4567-e89b-42d3-a456-426614174002", answeredAtMillis: now + 1 });
    expect(state.docs.get(`${userPath}/readingProgress/question`)).toMatchObject({ selectedAnswer: "A", answeredAtMillis: now + 1 });
  });

  it("clears ordering metadata on legacy overwrite so a later timestamped answer can apply", async () => {
    await save({ answeredAtMillis: now + 1000 });
    await save({ requestId: null, expectedUid: null, selectedAnswer: "B" });
    const legacy = state.docs.get(`${userPath}/readingProgress/question`)!;
    expect(legacy.selectedAnswer).toBe("B");
    expect(legacy).not.toHaveProperty("answeredAtMillis");
    expect(legacy).not.toHaveProperty("requestId");
    await save({ requestId: secondId, answeredAtMillis: now });
    expect(state.docs.get(`${userPath}/readingProgress/question`)).toMatchObject({ selectedAnswer: "A", requestId: secondId, answeredAtMillis: now });
  });

  it("new attempts retain existing lifetime leaderboard dedupe while accounting for each event", async () => {
    await save(); state.reads.mockClear(); await save({ requestId: secondId });
    expect(state.docs.get(boardPath)).toMatchObject({ score: 30, correctCount: 1 });
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 20, totalStudyMetrics: { reading: 2 } });
    expect(state.reads.mock.calls.some(([path]) => path.startsWith("leaderboards/"))).toBe(false);
  });

  it("rejects wrong learners and invalid IDs before scoring or writes", async () => {
    const resolve = vi.fn();
    await expect(save({ expectedUid: "other" }, "reading", resolve)).rejects.toMatchObject({ status: 403 });
    await expect(save({ requestId: "invalid/path" }, "reading", resolve)).rejects.toMatchObject({ status: 400 });
    expect(resolve).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
  });

  it("keeps legacy no-ID events and isolates reading and listening receipts", async () => {
    await save(); await save({}, "listening");
    await save({ requestId: null, expectedUid: null, selectedAnswer: "B" });
    expect(state.docs.has(`${userPath}/listeningProgressRequests/${firstId}`)).toBe(true);
    expect(state.docs.get(userPath)).toMatchObject({ totalStudyXp: 30, totalStudyMetrics: { reading: 2, listening: 1 } });
    expect(state.docs.get("leaderboards/listening_all_time/entries/learner")).toMatchObject({ score: 30 });
  });
});
