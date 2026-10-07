import { describe, expect, it } from "vitest";
import { coherentProfileStudyStreak, normalizeStudyStreak, studyDateKey } from "./study-streak";

const now = Date.parse("2026-10-07T10:00:00Z");
const today = "2026-10-07";
const profile = {
  studyStreakDays: 2, studyTodayDateKey: today, studyStudiedToday: true,
  studyTodayActivityCount: 3, studyStreakUpdatedAtMillis: now,
  lastStudyActivityAtMillis: now,
};

describe("study streak date normalization", () => {
  it("rolls over at Vietnam midnight", () => {
    expect(studyDateKey(Date.parse("2026-10-06T16:59:59Z"))).toBe("2026-10-06");
    expect(studyDateKey(Date.parse("2026-10-06T17:00:00Z"))).toBe(today);
  });
  it("keeps yesterday's run while clearing today's activity", () => {
    expect(normalizeStudyStreak({ ...profile, lastStudyActivityAtMillis: now - 86400000 }, today)).toMatchObject({ streakDays: 2, studiedToday: false, todayActivityCount: 0 });
  });
  it("breaks an old run even when its summary was refreshed today", () => {
    expect(normalizeStudyStreak({ ...profile, lastStudyActivityAtMillis: now - 2 * 86400000 }, today)).toMatchObject({ streakDays: 0, studiedToday: false });
  });
  it("does not infer an activity date from an unstudi​ed summary", () => {
    expect(normalizeStudyStreak({ studyStreakDays: 99, studyTodayDateKey: today, studyStudiedToday: false }, today).streakDays).toBe(0);
  });
  it("accepts a coherent fresh summary and rejects stale or contradictory ones", () => {
    expect(coherentProfileStudyStreak(profile, today, now)?.streakDays).toBe(2);
    expect(coherentProfileStudyStreak(profile, today, now + 3600001)).toBeNull();
    expect(coherentProfileStudyStreak({ ...profile, lastStudyActivityAtMillis: now - 86400000 }, today, now)).toBeNull();
    expect(coherentProfileStudyStreak({ ...profile, studyTodayActivityCount: 0 }, today, now)).toBeNull();
  });
});
