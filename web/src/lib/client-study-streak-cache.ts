export type StudyStreakSnapshot = {
  streakDays: number;
  studiedToday: boolean;
  todayActivityCount: number;
  todayDateKey: string;
  authenticated: boolean;
};

export const STUDY_STREAK_UPDATED_EVENT = "englishgo:study-streak-updated";
export const STUDY_STREAK_TTL_MS = 60_000;
type CachedStreak = { data: StudyStreakSnapshot; cachedAt: number; canonical: boolean };
const cache = new Map<string, CachedStreak>();

export function studyDateKey(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function readStudyStreakCache(uid: string): CachedStreak | null {
  const entry = cache.get(uid);
  return entry?.data.todayDateKey === studyDateKey() ? entry : null;
}

export function seedStudyStreak(uid: string, data: StudyStreakSnapshot): void {
  if (!readStudyStreakCache(uid) && data.authenticated && data.todayDateKey === studyDateKey()) {
    cache.set(uid, { data, cachedAt: Date.now(), canonical: false });
  }
}

/** Publish an authoritative snapshot already read by a page, without another request. */
export function publishStudyStreak(uid: string, data: StudyStreakSnapshot, canonical = true): void {
  if (!uid || !data.authenticated || data.todayDateKey !== studyDateKey()) return;
  cache.set(uid, { data, cachedAt: Date.now(), canonical });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STUDY_STREAK_UPDATED_EVENT, { detail: { uid } }));
  }
}
