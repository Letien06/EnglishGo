import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/types";
import { mergeFirestoreWrite } from "@/test/firestore-merge";

const mocks = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), nextId: 0 }));
type Ref = { path: string; doc: (id: string) => Ref; collection: (name: string) => Ref; get: () => Promise<ReturnType<typeof snapshot>>; set: (data: Record<string, unknown>) => Promise<void>; add: (data: Record<string, unknown>) => Promise<{ id: string }>; delete: () => Promise<void> };
function snapshot(ref: Ref) {
  const data = mocks.docs.get(ref.path);
  return { exists: data !== undefined, id: ref.path.split("/").at(-1), data: () => data, get: (field: string) => data?.[field] };
}
function reference(path: string): Ref {
  return {
    path, doc: (id) => reference(`${path}/${id}`), collection: (name) => reference(`${path}/${name}`),
    get: async () => snapshot(reference(path)),
    set: async (data) => { mocks.docs.set(path, mergeFirestoreWrite(mocks.docs.get(path) ?? {}, data)); },
    add: async (data) => { const id = String(++mocks.nextId); mocks.docs.set(`${path}/${id}`, data); return { id }; },
    delete: async () => { mocks.docs.delete(path); },
  };
}
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback, revalidateTag: vi.fn() }));
vi.mock("./learner-cache", () => ({ invalidateLearnerActivityCaches: vi.fn(), invalidateProgressReportCache: vi.fn(), studyStreakCacheTag: vi.fn() }));
vi.mock("./rate-limit", () => ({ enforceDailyActionLimit: vi.fn(async () => undefined) }));
vi.mock("./gemini", () => ({ generateJson: vi.fn(async () => { throw new Error("Use deterministic grading fallback"); }) }));
vi.mock("./content-quality", () => ({ recordContentQualityAttempt: vi.fn(async () => undefined) }));
vi.mock("./leaderboard", () => ({ buildPracticeLeaderboardDecision: vi.fn(async () => ({})), recordPracticeLeaderboardAttempt: vi.fn(async () => undefined) }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => true, contentCacheKey: () => "metrics-tests" }));
vi.mock("./dautoeic", () => ({
  listTests: async () => [{ id: "external", name: "Test", totalQuestions: 3 }],
  routeTestId: () => 123, routeQuestionId: (id: string) => Number(id),
  optionId: (_id: number, letter: string) => letter.charCodeAt(0),
  optionLetter: (id?: number) => id == null ? null : String.fromCharCode(id),
  getPart: async () => ({ questions: [1, 2, 3].map((id) => ({ id: String(id), testId: "external", part: 5, questionText: "Question", optionA: "Answer", correctAnswer: "A" })) }),
}));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: (name: string) => reference(name),
  runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const staged: [Ref, Record<string, unknown>][] = [];
    const result = await callback({ get: async (ref: Ref) => snapshot(ref), set: (ref: Ref, data: Record<string, unknown>) => staged.push([ref, data]) });
    for (const [ref, data] of staged) await ref.set(data);
    return result;
  },
} }));

import { submitWritingAttempt } from "./writing";
import { submitAttempt } from "./dictation";
import { submit } from "./practice";

const user = { uid: "learner", displayName: "Learner", email: "learner@example.com", avatarUrl: null } as AppUser;
beforeEach(() => { mocks.docs.clear(); mocks.nextId = 0; vi.clearAllMocks(); });

describe("persisted learning metrics", () => {
  it("counts a graded Writing submission with its recorded elapsed time", async () => {
    const result = await submitWritingAttempt(user, { promptId: "p1-meeting-preparation", responseText: "The employee is preparing the meeting room for a presentation.", elapsedSeconds: 42 });
    expect(mocks.docs.has(`users/learner/writingAttempts/${result.id}`)).toBe(true);
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetrics: { writing: 1, studySeconds: 42 }, totalStudyMetrics: { writing: 1, studySeconds: 42 }, totalStudyXp: 0 });
  });

  it("counts actual answered test questions while excluding blank questions", async () => {
    mocks.docs.set("users/learner/practiceDrafts/practice-123-part-parts-5-time-18", { startedAtMillis: Date.now() - 90000 });
    const result = await submit(user, 123, [{ questionId: 1, selectedOptionId: 65 }, { questionId: 2, selectedOptionId: 66 }], { mode: "part", parts: [5], durationMinutes: 18 });
    expect(result.questionCount).toBe(3);
    expect(result.correctCount).toBe(1);
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetrics: { practice: 2, studySeconds: 90 }, totalStudyMetrics: { practice: 2 }, practiceCompletedTests: 1, totalStudyXp: 20 });
  });

  it("counts a video lesson only once when its final dictation segment is completed", async () => {
    mocks.docs.set("dictationLessons/video-one", { title: "One lesson", youtubeVideoId: "video", status: "PUBLISHED", segmentCount: 2, durationSeconds: 300, sourceName: "Source", level: "B1" });
    for (const id of ["one", "two"]) mocks.docs.set(`dictationLessons/video-one/segments/${id}`, { lessonId: "video-one", status: "PUBLISHED", index: id === "one" ? 0 : 1, expectedText: "Hello world", startSeconds: 0, endSeconds: 2, wordCount: 2 });
    const answer = { maskPercent: 100 as const, fullAnswer: "Hello world", blankAnswers: {}, hintCount: 0, replayCount: 0, elapsedSeconds: 0 };
    await submitAttempt("learner", "video-one", "one", answer);
    expect(mocks.docs.get("users/learner")).toBeUndefined();
    await submitAttempt("learner", "video-one", "two", answer);
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetrics: { video: 1 }, totalStudyMetrics: { video: 1 } });
    await submitAttempt("learner", "video-one", "two", answer);
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetrics: { video: 1 }, totalStudyMetrics: { video: 1 } });
    expect((mocks.docs.get("users/learner")?.totalStudyMetrics as Record<string, unknown>).studySeconds).toBeUndefined();
  });

  it("keeps expired practice results but omits time from a week-old draft", async () => {
    const week = 7 * 86400000;
    mocks.docs.set("users/learner/practiceDrafts/practice-123-part-parts-5-time-18", { startedAtMillis: Date.now() - week });
    const result = await submit(user, 123, [{ questionId: 1, selectedOptionId: 65 }], { mode: "part", parts: [5], durationMinutes: 18 });
    expect(result.expired).toBe(true);
    expect(result.elapsedMillis).toBeGreaterThanOrEqual(week);
    expect(mocks.docs.get("users/learner")).toMatchObject({ studyTodayMetrics: { practice: 1 }, totalStudyMetrics: { practice: 1 } });
    expect((mocks.docs.get("users/learner")?.studyTodayMetrics as Record<string, unknown>).studySeconds).toBeUndefined();
    expect((mocks.docs.get("users/learner")?.totalStudyMetrics as Record<string, unknown>).studySeconds).toBeUndefined();
  });
});
