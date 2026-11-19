import { revalidateTag } from "next/cache";

export const STUDY_STREAK_LEADERBOARD_CACHE_TAG = "study-streak-leaderboard";

/** Personal reads expire immediately; the shared leaderboard refreshes in the background. */
export function dashboardCacheTag(uid: string): string {
  return `learner-dashboard:${uid}`;
}

export function progressReportCacheTag(uid: string): string {
  return `learner-progress-report:${uid}`;
}

export function studyStreakCacheTag(uid: string): string {
  return `learner-study-streak:${uid}`;
}

export function invalidateLearnerActivityCaches(uid: string): void {
  if (!uid?.trim()) return;
  revalidateTag(dashboardCacheTag(uid), { expire: 0 });
  revalidateTag(studyStreakCacheTag(uid), { expire: 0 });
  // Do NOT invalidate the global streak leaderboard on every single learner
  // answer — it relies on its 60-second time-based revalidation to prevent
  // every user action from triggering a multi-page users scan.
}

export function invalidateProgressReportCache(uid: string): void {
  if (!uid?.trim()) return;
  revalidateTag(progressReportCacheTag(uid), { expire: 0 });
  revalidateTag(dashboardCacheTag(uid), { expire: 0 });
}
