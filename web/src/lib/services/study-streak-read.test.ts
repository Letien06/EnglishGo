import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ users: [] as { id: string; data: () => Record<string, unknown> }[], reads: vi.fn(), keys: [] as string[][] }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/server-cache", () => ({ readServerCache: (callback: () => unknown, keys: string[]) => { mocks.keys.push(keys); return callback(); } }));
vi.mock("./learner-cache", () => ({ invalidateLearnerActivityCaches: vi.fn(), studyStreakCacheTag: () => "personal", STUDY_STREAK_LEADERBOARD_CACHE_TAG: "global" }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: { collection: () => ({
  orderBy: () => {
    let start = 0;
    const query = {
      limit: () => query,
      startAfter: (cursor: { id: string }) => { start = mocks.users.findIndex((user) => user.id === cursor.id) + 1; return query; },
      get: async () => { mocks.reads(start); return { docs: mocks.users.slice(start, start + 100) }; },
    };
    return query;
  },
  doc: (uid: string) => ({ get: async () => { const doc = mocks.users.find((user) => user.id === uid); return { exists: Boolean(doc), data: doc?.data }; } }),
}) } }));
import { getStoredStudyStreakSummary, getStudyStreakLeaderboard } from "./study-activity";

const now = Date.parse("2026-10-07T10:00:00Z");
function user(id: string, streak: number, age: number) {
  return { id, data: () => ({ studyStreakDays: streak, lastStudyActivityAtMillis: now - age * 86400000, studyTodayDateKey: "2026-10-07", studyStudiedToday: age === 0, studyTodayActivityCount: age === 0 ? 2 : 0, studyStreakUpdatedAtMillis: now }) };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); mocks.users = []; mocks.keys = []; mocks.reads.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe("current streak reads", () => {
  it("pages past broken high streaks to find active users and assigns new ranks", async () => {
    mocks.users = [...Array.from({ length: 100 }, (_, i) => user(`old${i}`, 1000 - i, 2)), user("yesterday", 4, 1), user("today", 3, 0)];
    const entries = await getStudyStreakLeaderboard(2);
    expect(mocks.reads.mock.calls).toEqual([[0], [100]]);
    expect(entries.map(({ uid, rank, studiedToday }) => ({ uid, rank, studiedToday }))).toEqual([{ uid: "yesterday", rank: 1, studiedToday: false }, { uid: "today", rank: 2, studiedToday: true }]);
  });
  it("stops after a full page already contains the requested active count", async () => {
    mocks.users = Array.from({ length: 110 }, (_, i) => user(`active${i}`, 200 - i, 0));
    expect(await getStudyStreakLeaderboard(2)).toHaveLength(2);
    expect(mocks.reads).toHaveBeenCalledTimes(1);
  });
  it("reads cutoff ties across pages before applying the activity and name ordering", async () => {
    mocks.users = [
      user("leader", 10, 0),
      ...Array.from({ length: 99 }, (_, i) => user(`yesterday${i}`, 5, 1)),
      { id: "z-today", data: () => ({ ...user("z-today", 5, 0).data(), displayName: "Zulu" }) },
      { id: "a-today", data: () => ({ ...user("a-today", 5, 0).data(), displayName: "Alpha" }) },
      user("lower", 4, 0),
    ];
    expect((await getStudyStreakLeaderboard(2)).map((entry) => entry.uid)).toEqual(["leader", "a-today"]);
    expect(mocks.reads.mock.calls).toEqual([[0], [100]]);
  });
  it("keys personal summaries by the local day and falls back for contradictory dates", async () => {
    mocks.users = [user("current", 2, 0), { id: "broken", data: () => ({ ...user("broken", 99, 2).data(), studyStudiedToday: true }) }];
    expect(await getStoredStudyStreakSummary("current")).toMatchObject({ streakDays: 2, lastActivityAtMillis: now });
    expect(await getStoredStudyStreakSummary("broken")).toBeNull();
    expect(mocks.keys[0]).toContain("2026-10-07");
    vi.setSystemTime(Date.parse("2026-10-07T17:00:00Z"));
    expect(await getStoredStudyStreakSummary("current")).toBeNull();
    expect(mocks.keys[2]).toContain("2026-10-08");
  });
});
