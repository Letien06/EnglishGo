import { describe, expect, it } from "vitest";
import { reconcileLearnerStreak } from "./study-streak-leaderboard";
import type { StudyStreakLeaderboardEntry, StudyStreakSummary } from "./services/study-activity";

const row = (uid: string, streakDays: number): StudyStreakLeaderboardEntry => ({
  uid, rank: 1, displayName: uid, email: null, avatarUrl: null,
  streakDays, studiedToday: false, todayActivityCount: 0, lastActivityAtMillis: 0,
});
const summary: StudyStreakSummary = {
  streakDays: 1, studiedToday: true, todayActivityCount: 3,
  todayModules: ["vocab"], todayDateKey: "2026-10-07",
};

describe("canonical learner streak in a shared leaderboard", () => {
  it("replaces a stale own row, updates today's status, and recalculates rankings", () => {
    const cached = [row("me", 9), row("other", 2)];
    const result = reconcileLearnerStreak(cached, row("me", 0), summary);
    expect(result.map(({ uid, rank }) => [uid, rank])).toEqual([["other", 1], ["me", 2]]);
    expect(result[1]).toMatchObject({ streakDays: 1, studiedToday: true, todayActivityCount: 3 });
    expect(cached[0]).toMatchObject({ streakDays: 9, studiedToday: false });
  });

  it("removes a broken own streak and leaves the other learners' data intact", () => {
    const result = reconcileLearnerStreak([row("me", 9), row("other", 2)], row("me", 0), { ...summary, streakDays: 0, studiedToday: false, todayActivityCount: 0 });
    expect(result).toEqual([{ ...row("other", 2), rank: 1 }]);
  });

  it("inserts a newly active learner missing from the cached board and respects the ranking limit", () => {
    const cached = [row("other", 1), row("leader", 2)];
    const result = reconcileLearnerStreak(cached, row("me", 0), { ...summary, lastActivityAtMillis: 100 }, 2);
    expect(result.map(({ uid, rank }) => [uid, rank])).toEqual([["leader", 1], ["me", 2]]);
    expect(result[1]).toMatchObject({ studiedToday: true, todayActivityCount: 3, lastActivityAtMillis: 100 });
    expect(cached).toHaveLength(2);
  });
});
