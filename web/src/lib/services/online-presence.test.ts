import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mergeFirestoreWrite } from "@/test/firestore-merge";

const mocks = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), invalidate: vi.fn() }));
type Ref = { path: string; doc: (id: string) => Ref; collection: (id: string) => Ref; get: () => Promise<{ data: () => Record<string, unknown> | undefined }> };
function ref(path: string): Ref {
  return { path, doc: (id) => ref(`${path}/${id}`), collection: (id) => ref(`${path}/${id}`), get: async () => ({ data: () => mocks.docs.get(path) }) };
}
vi.mock("./learner-cache", () => ({ invalidateLearnerActivityCaches: mocks.invalidate, studyStreakCacheTag: () => "personal", STUDY_STREAK_LEADERBOARD_CACHE_TAG: "global" }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const writes: [Ref, Record<string, unknown>, boolean][] = [];
    const result = await callback({
      get: async (reference: Ref) => ({ exists: mocks.docs.has(reference.path), data: () => mocks.docs.get(reference.path) }),
      set: (reference: Ref, value: Record<string, unknown>, options?: { merge?: boolean }) => writes.push([reference, value, options?.merge === true]),
    });
    for (const [reference, value, merge] of writes) mocks.docs.set(reference.path, mergeFirestoreWrite(merge ? mocks.docs.get(reference.path) ?? {} : {}, value));
    return result;
  },
} }));
import { getOnlinePresence, recordOnlinePresence } from "./online-presence";
import { recordStudyActivity } from "./study-activity";
import { coherentProfileStudyStreak, studyDateKey } from "@/lib/study-streak";

const now = Date.parse("2026-10-07T10:00:00Z");
const userPath = "users/learner";
const dayPath = `${userPath}/studyActivity/2026-10-07`;
const beat = (sequence: number, elapsedSeconds = 30, active = true, sessionId = "tab-a") => recordOnlinePresence("learner", { sessionId, sequence, elapsedSeconds, active, dateKey: studyDateKey() });
const advance = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); mocks.docs.clear(); vi.clearAllMocks(); });
afterEach(() => vi.useRealTimers());

it("requires ten real minutes, returns partial progress and awards no XP or study metrics", async () => {
  await beat(1, 60);
  expect((await getOnlinePresence("learner")).onlineSecondsToday).toBe(0);
  for (let i = 2; i <= 20; i++) { advance(30); await beat(i); }
  expect(await getOnlinePresence("learner")).toMatchObject({ onlineSecondsToday: 570, studiedToday: false });
  advance(30);
  expect(await beat(21)).toMatchObject({ onlineSecondsToday: 600, streakDays: 1, studiedToday: true });
  expect(mocks.docs.get(dayPath)).toMatchObject({ streakEligible: true, onlineSeconds: 600 });
  const profile = mocks.docs.get(userPath)!;
  expect(profile.totalStudyXp).toBeUndefined();
  expect(profile.totalStudyMetrics).toBeUndefined();
  expect(profile.studyTodayActivityCount).toBe(0);
  expect(mocks.docs.has(`${userPath}/dailySummaries/2026-10-07`)).toBe(false);
  expect(coherentProfileStudyStreak(profile, "2026-10-07")).toMatchObject({ streakDays: 1, studiedToday: true });
  expect(mocks.invalidate).toHaveBeenCalledTimes(1);
});

it("deduplicates retries and bounds simultaneous tabs/devices by a single server lease", async () => {
  await beat(1, 0);
  advance(10);
  expect(await beat(2, 60)).toMatchObject({ onlineSecondsToday: 10 });
  expect(await beat(2, 60)).toMatchObject({ onlineSecondsToday: 10 });
  expect(await beat(1, 60, true, "tab-b")).toMatchObject({ onlineSecondsToday: 10, ownsSession: false });
  advance(30);
  await beat(3, 30, false);
  expect(await beat(2, 60, true, "tab-b")).toMatchObject({ onlineSecondsToday: 40, ownsSession: true });
  advance(30);
  expect(await beat(3, 30, true, "tab-b")).toMatchObject({ onlineSecondsToday: 70 });
});

it("does not count hidden time or a suspended browser", async () => {
  await beat(1, 0);
  advance(12); await beat(2, 12, false);
  advance(3600);
  expect(await beat(3, 60)).toMatchObject({ onlineSecondsToday: 12 });
  advance(3600);
  expect(await beat(4, 60)).toMatchObject({ onlineSecondsToday: 12 });
  advance(30);
  expect(await beat(5)).toMatchObject({ onlineSecondsToday: 42 });
});

it("retains an existing activity streak and increments it only once for online qualification", async () => {
  await recordStudyActivity("learner", { module: "reading", activityType: "answer", occurredAtMillis: now - 86400000 });
  await recordStudyActivity("learner", { module: "reading", activityType: "answer", occurredAtMillis: now });
  mocks.docs.set(userPath, { ...mocks.docs.get(userPath), studyTodayOnlineDateKey: "2026-10-07", studyTodayOnlineSeconds: 570 });
  await beat(1, 0); advance(30);
  expect(await beat(2)).toMatchObject({ streakDays: 2, onlineSecondsToday: 600 });
  advance(30); await beat(3);
  await recordStudyActivity("learner", { module: "vocab", activityType: "review" });
  expect(mocks.docs.get(userPath)).toMatchObject({ studyStreakDays: 2, studyTodayActivityCount: 2, totalStudyXp: 25 });
});

it("continues yesterday's streak and clears stale daily metrics before a real activity", async () => {
  await recordStudyActivity("learner", { module: "reading", activityType: "answer", durationSeconds: 90, occurredAtMillis: now - 86400000 });
  mocks.docs.set(userPath, { ...mocks.docs.get(userPath), studyTodayOnlineDateKey: "2026-10-07", studyTodayOnlineSeconds: 570 });
  await beat(1, 0); advance(30); await beat(2);
  expect(mocks.docs.get(userPath)).toMatchObject({ studyStreakDays: 2, studyTodayActivityCount: 0, studyTodayXp: 0 });
  await recordStudyActivity("learner", { module: "vocab", activityType: "review" });
  expect(mocks.docs.get(userPath)).toMatchObject({ studyStreakDays: 2, studyTodayActivityCount: 1, studyTodayXp: 5 });
  expect((mocks.docs.get(userPath)?.studyTodayMetrics as Record<string, unknown>).studySeconds).toBeUndefined();
});

it("splits at Vietnam midnight and preserves the lifetime total", async () => {
  vi.setSystemTime(Date.parse("2026-10-07T16:59:50Z"));
  await beat(1, 0); advance(5); await beat(2, 5);
  advance(10);
  expect(await beat(3, 10)).toMatchObject({ todayDateKey: "2026-10-08", onlineSecondsToday: 5, totalOnlineSeconds: 10, studiedToday: false });
});

it("starts a new streak after a missed day and resets milestone notifications", async () => {
  await recordStudyActivity("learner", { module: "reading", activityType: "answer", occurredAtMillis: now - 2 * 86400000 });
  mocks.docs.set(userPath, { ...mocks.docs.get(userPath), studyStreakMilestonesSeen: [1], studyTodayOnlineDateKey: "2026-10-07", studyTodayOnlineSeconds: 570 });
  await beat(1, 0); advance(30); await beat(2);
  expect(mocks.docs.get(userPath)).toMatchObject({ studyStreakDays: 1, studyStreakMilestonesSeen: [] });
});

it("never credits a delayed previous-day request into today", async () => {
  vi.setSystemTime(Date.parse("2026-10-07T16:59:40Z"));
  await beat(1, 0); advance(30);
  const result = await recordOnlinePresence("learner", { sessionId: "tab-a", sequence: 2, elapsedSeconds: 30, active: true, dateKey: "2026-10-07" });
  expect(result).toMatchObject({ todayDateKey: "2026-10-08", onlineSecondsToday: 0 });
});
