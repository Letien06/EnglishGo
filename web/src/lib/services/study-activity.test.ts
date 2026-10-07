import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeFirestoreWrite } from "@/test/firestore-merge";

const mocks = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), reads: vi.fn(), writes: vi.fn() }));
function reference(path: string): { path: string; doc: (id: string) => ReturnType<typeof reference>; collection: (name: string) => ReturnType<typeof reference> } {
  return { path, doc: (id) => reference(`${path}/${id}`), collection: (name) => reference(`${path}/${name}`) };
}
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("./learner-cache", () => ({ invalidateLearnerActivityCaches: vi.fn(), studyStreakCacheTag: vi.fn() }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: (name: string) => reference(name),
  runTransaction: async (callback: (tx: unknown) => Promise<void>) => {
    const staged: [ReturnType<typeof reference>, Record<string, unknown>][] = [];
    await callback({
      get: async (ref: ReturnType<typeof reference>) => {
        mocks.reads(ref.path);
        return { exists: mocks.docs.has(ref.path), data: () => mocks.docs.get(ref.path) };
      },
      set: (ref: ReturnType<typeof reference>, data: Record<string, unknown>) => staged.push([ref, data]),
    });
    for (const [ref, data] of staged) {
      mocks.writes(ref.path, data);
      mocks.docs.set(ref.path, mergeFirestoreWrite(mocks.docs.get(ref.path) ?? {}, data));
    }
  },
} }));
import { recordStudyActivity } from "./study-activity";

const timestamp = Date.parse("2026-10-07T10:00:00Z");
const dailyPath = "users/learner/dailySummaries/2026-10-07";
beforeEach(() => { mocks.docs.clear(); vi.clearAllMocks(); });

describe("accurate study accounting", () => {
  it("separates event XP from question/word quantities and merges independent metrics", async () => {
    await recordStudyActivity("learner", { module: "reading", activityType: "answer", metric: "reading", quantity: 1, durationSeconds: 15, occurredAtMillis: timestamp });
    await recordStudyActivity("learner", { module: "listening", activityType: "answer", metric: "listening", quantity: 1, occurredAtMillis: timestamp });
    await recordStudyActivity("learner", { module: "practice", activityType: "practice_exam_submit", metric: "practice", quantity: 27, durationSeconds: 120, occurredAtMillis: timestamp });
    await recordStudyActivity("learner", { module: "vocab", activityType: "vocab_review_batch", metric: "vocab", quantity: 48, occurredAtMillis: timestamp });
    await recordStudyActivity("learner", { module: "writing", activityType: "writing_graded_submission", metric: "writing", quantity: 1, durationSeconds: 90, occurredAtMillis: timestamp });
    await recordStudyActivity("learner", { module: "video", activityType: "dictation_lesson_completed", metric: "video", quantity: 1, occurredAtMillis: timestamp });
    const expected = { reading: 1, listening: 1, practice: 27, vocab: 48, writing: 1, video: 1, studySeconds: 225 };
    expect(mocks.docs.get(dailyPath)).toMatchObject({ metrics: expected, xp: 45, totalActivityCount: 6, metricsVersion: 1, metricsIncomplete: false, moduleCounts: { reading: 1, listening: 1, practice: 1, vocab: 1, writing: 1, video: 1 } });
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetrics: expected, totalStudyMetrics: expected, totalStudyXp: 45, studyLongestStreakDays: 1 });
    expect(mocks.reads).toHaveBeenCalledTimes(12);
    for (const [, data] of mocks.writes.mock.calls) expect(Object.keys(data).some((key) => key.includes("."))).toBe(false);
  });

  it("resets today's quantities while preserving lifetime totals and longest observed streak", async () => {
    await recordStudyActivity("learner", { module: "practice", activityType: "submit", metric: "practice", quantity: 7, durationSeconds: 90, occurredAtMillis: timestamp });
    await recordStudyActivity("learner", { module: "vocab", activityType: "review", metric: "vocab", quantity: 2, occurredAtMillis: timestamp + 86400000 });
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetrics: { practice: 0, vocab: 2 }, totalStudyMetrics: { practice: 7, vocab: 2 }, studyStreakDays: 2, studyLongestStreakDays: 2 });
    expect((mocks.docs.get("users/learner")?.studyTodayMetrics as Record<string, unknown>).studySeconds).toBeUndefined();
    expect((mocks.docs.get("users/learner")?.totalStudyMetrics as Record<string, unknown>).studySeconds).toBe(90);
    await recordStudyActivity("learner", { module: "reading", activityType: "answer", metric: "reading", quantity: 1, occurredAtMillis: timestamp + 3 * 86400000 });
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyStreakDays: 1, studyLongestStreakDays: 2 });
    expect((mocks.docs.get("users/learner/dailySummaries/2026-10-08")?.metrics as Record<string, unknown>).studySeconds).toBeUndefined();
  });

  it("marks a legacy day incomplete instead of presenting old event counts as answered questions", async () => {
    mocks.docs.set("users/learner/studyActivity/2026-10-07", { activityCount: 8 });
    mocks.docs.set("users/learner", { studyTodayDateKey: "2026-10-07", studyTodayActivityCount: 8, studyStreakDays: 4 });
    await recordStudyActivity("learner", { module: "practice", activityType: "submit", metric: "practice", quantity: 3, occurredAtMillis: timestamp });
    expect(mocks.docs.get(dailyPath)).toMatchObject({ metricsIncomplete: true, metrics: { practice: 3 }, metricsSinceMillis: timestamp });
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetricsIncomplete: true, totalStudyMetrics: { practice: 3 }, studyMetricsSinceMillis: timestamp, studyLongestStreakDays: 4 });
    await recordStudyActivity("learner", { module: "vocab", activityType: "review", metric: "vocab", occurredAtMillis: timestamp });
    expect(mocks.docs.get(dailyPath)?.metricsIncomplete).toBe(true);
  });

  it("migrates known literal dotted event totals without treating them as question metrics", async () => {
    mocks.docs.set("users/learner", { "studyModuleTotals.practice": 5, "studyModuleTotals.vocab": 9, studyModuleTotals: { reading: 3 } });
    await recordStudyActivity("learner", { module: "practice", activityType: "submit", metric: "practice", quantity: 20, occurredAtMillis: timestamp });
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyModuleTotals: { practice: 6, vocab: 9, reading: 3 }, totalStudyMetrics: { practice: 20, vocab: 0, reading: 0 } });
  });
});
