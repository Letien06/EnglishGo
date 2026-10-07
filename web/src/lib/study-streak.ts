export function studyDateKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function shiftStudyDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** A current streak remains active through yesterday; an older run is broken. */
export function normalizeStudyStreak(profile: Record<string, unknown>, todayDateKey = studyDateKey()) {
  const timestamp = profile.lastStudyActivityAtMillis;
  const lastActivityDate = typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
    ? studyDateKey(timestamp)
    : profile.studyStudiedToday === true && typeof profile.studyTodayDateKey === "string" ? profile.studyTodayDateKey : null;
  const active = lastActivityDate === todayDateKey || lastActivityDate === shiftStudyDate(todayDateKey, -1);
  const studiedToday = lastActivityDate === todayDateKey;
  const summaryIsToday = profile.studyTodayDateKey === todayDateKey;
  return {
    streakDays: active ? count(profile.studyStreakDays) : 0,
    studiedToday,
    todayActivityCount: studiedToday && summaryIsToday ? count(profile.studyTodayActivityCount) : 0,
    todayDateKey,
  };
}

/** Only a fresh, internally consistent summary can replace the history read. */
export function coherentProfileStudyStreak(profile: Record<string, unknown>, todayDateKey = studyDateKey(), now = Date.now(), maxAgeMs = 60 * 60 * 1000) {
  const updated = profile.studyStreakUpdatedAtMillis;
  if (profile.studyTodayDateKey !== todayDateKey || typeof updated !== "number" || !Number.isFinite(updated) || updated > now || now - updated > maxAgeMs) return null;
  const current = normalizeStudyStreak(profile, todayDateKey);
  if (current.streakDays > 0 && (typeof profile.lastStudyActivityAtMillis !== "number" || !Number.isFinite(profile.lastStudyActivityAtMillis) || profile.lastStudyActivityAtMillis <= 0)) return null;
  if (typeof profile.studyStreakDays !== "number" || !Number.isFinite(profile.studyStreakDays) || profile.studyStreakDays !== current.streakDays || profile.studyStudiedToday !== current.studiedToday) return null;
  if (current.studiedToday && (current.todayActivityCount <= 0 || current.streakDays <= 0)) return null;
  return current;
}
