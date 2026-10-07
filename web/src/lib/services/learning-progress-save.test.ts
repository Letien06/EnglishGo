import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeFirestoreWrite } from "@/test/firestore-merge";
import { FieldValue } from "firebase-admin/firestore";

const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), failCommit: false, retry: false, writes: vi.fn(), reads: vi.fn(), tail: Promise.resolve() }));
type Ref = { path: string; doc: (id: string) => Ref; collection: (name: string) => Ref; get: () => Promise<ReturnType<typeof snapshot>> };
function ref(path: string): Ref {
  const reference: Ref = { path, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`), get: async () => snapshot(reference) };
  return reference;
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
        const staged: [Ref, Record<string, unknown>, boolean][] = [];
        const result = await callback({
          get: async (reference: Ref) => {
            if (staged.length) throw new Error("Read after write");
            state.reads(reference.path);
            return snapshot(reference);
          },
          set: (reference: Ref, data: Record<string, unknown>, options?: { merge: boolean }) => staged.push([reference, data, options?.merge === true]),
        });
        if (state.failCommit) throw new Error("Commit failed");
        if (commit) for (const [reference, data, merge] of staged) {
          state.writes(reference.path);
          state.docs.set(reference.path, mergeFirestoreWrite(merge ? state.docs.get(reference.path) ?? {} : {}, data));
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
import { learningProgressProjectionShard, prepareLearningProgressProjection } from "./learning-progress-projection";
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
      return { part: body.part!, sourceLevel: 3, itemId: "item", questionId: "question", selectedAnswer: body.selectedAnswer, correct: body.selectedAnswer === "A", elapsedSeconds: 15, completedAtMillis: now,
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
