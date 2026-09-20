import { revalidateTag } from "next/cache";

/** Tags are deliberately per learner, so an activity never evicts another learner's cache. */
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
}

export function invalidateProgressReportCache(uid: string): void {
  if (!uid?.trim()) return;
  revalidateTag(progressReportCacheTag(uid), { expire: 0 });
  revalidateTag(dashboardCacheTag(uid), { expire: 0 });
}
