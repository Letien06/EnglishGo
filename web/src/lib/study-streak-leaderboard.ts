import type { StudyStreakLeaderboardEntry, StudyStreakSummary } from "./services/study-activity";

/** A shared board may be cached; reconcile the learner's canonical read before ranking. */
export function reconcileLearnerStreak(
  entries: StudyStreakLeaderboardEntry[],
  learner: Pick<StudyStreakLeaderboardEntry, "uid" | "displayName" | "email" | "avatarUrl">,
  summary: StudyStreakSummary,
  limit = 100,
): StudyStreakLeaderboardEntry[] {
  const own = entries.find((entry) => entry.uid === learner.uid);
  const rows = entries.filter((entry) => entry.uid !== learner.uid).map((entry) => ({ ...entry }));
  if (summary.streakDays > 0) rows.push({
    ...(own ?? { ...learner, rank: 0, lastActivityAtMillis: null }),
    ...learner,
    streakDays: summary.streakDays,
    studiedToday: summary.studiedToday,
    todayActivityCount: summary.todayActivityCount,
    lastActivityAtMillis: summary.lastActivityAtMillis ?? own?.lastActivityAtMillis ?? null,
  });
  return rows
    .filter((entry) => entry.streakDays > 0)
    .sort((a, b) => b.streakDays - a.streakDays
      || (b.lastActivityAtMillis ?? 0) - (a.lastActivityAtMillis ?? 0)
      || (a.displayName ?? a.email ?? a.uid).localeCompare(b.displayName ?? b.email ?? b.uid))
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}
