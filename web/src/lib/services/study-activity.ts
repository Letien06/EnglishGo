import { FieldValue } from "firebase-admin/firestore";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firestore/db";
import { readServerCache } from "@/lib/server-cache";
import { invalidateLearnerActivityCaches, studyStreakCacheTag, STUDY_STREAK_LEADERBOARD_CACHE_TAG } from "./learner-cache";
import { coherentProfileStudyStreak, normalizeStudyStreak } from "@/lib/study-streak";

const ACTIVITY_COLLECTION = "studyActivity";
const DAILY_SUMMARY_COLLECTION = "dailySummaries";
const STREAK_LOOKBACK_LIMIT = 500;
const STUDY_TIME_ZONE = "Asia/Ho_Chi_Minh";
const SUMMARY_MAX_AGE_MS = 60 * 60 * 1000;
const STREAK_MILESTONE_STARTERS = new Set([1, 3, 7]);

export type StudyModule = "listening" | "reading" | "practice" | "vocab" | "writing" | "video";
export type StudyMetric = StudyModule;
const COUNT_METRICS: StudyMetric[] = ["listening", "reading", "practice", "vocab", "writing", "video"];

export interface StudyActivityInput {
  module: StudyModule;
  activityType: string;
  sourceId?: string | number | null;
  occurredAtMillis?: number | null;
  metric?: StudyMetric;
  quantity?: number;
  durationSeconds?: number | null;
}

export interface StudyStreakSummary {
  lastActivityAtMillis?: number | null;
  streakDays: number;
  studiedToday: boolean;
  todayActivityCount: number;
  todayModules: StudyModule[];
  todayDateKey: string;
}

export interface StudyStreakLeaderboardEntry {
  rank: number;
  uid: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  streakDays: number;
  studiedToday: boolean;
  todayActivityCount: number;
  lastActivityAtMillis: number | null;
}

export interface StudyDailySummary {
  dateKey: string;
  totalActivityCount: number;
  xp: number;
  moduleCounts: Record<StudyModule, number>;
}

/** Milestones are 1, 3, 7, then every ten consecutive study days. */
export function isStudyStreakMilestone(streakDays: number): boolean {
  return STREAK_MILESTONE_STARTERS.has(streakDays) || (streakDays >= 10 && streakDays % 10 === 0);
}

export async function recordStudyActivity(
  uid: string,
  input: StudyActivityInput,
): Promise<void> {
  if (!uid?.trim()) return;

  const now = input.occurredAtMillis ?? Date.now();
  const dateKey = dateKeyForMillis(now);
  const ref = activityCollection(uid).doc(dateKey);
  const userRef = adminDb.collection("users").doc(uid);

  await adminDb.runTransaction(async (tx) => {
    const [snap, userSnap] = await Promise.all([tx.get(ref), tx.get(userRef)]);
    writeStudyActivityInTransaction(tx, uid, input, snap, userSnap.data() ?? {});
  });

  invalidateLearnerActivityCaches(uid);

}

/** Compose accounting writes with an existing transaction to keep retries atomic. */
export function studyActivityDayRef(uid: string, occurredAtMillis: number) {
  return activityCollection(uid).doc(dateKeyForMillis(occurredAtMillis));
}

export function writeStudyActivityInTransaction(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  input: StudyActivityInput,
  snap: FirebaseFirestore.DocumentSnapshot,
  userData: Record<string, unknown>,
): void {
  const now = input.occurredAtMillis ?? Date.now();
  const dateKey = dateKeyForMillis(now);
  const ref = activityCollection(uid).doc(dateKey);
  const dailyRef = dailySummaryCollection(uid).doc(dateKey);
  const userRef = adminDb.collection("users").doc(uid);
  const sourceId = input.sourceId == null ? null : String(input.sourceId);
  const xp = xpForActivity(input.module);
  const current = snap.data() as
    | { firstActivityAtMillis?: number; activityCount?: number; metricsVersion?: number; metricsSinceMillis?: number; metricsIncomplete?: boolean }
    | undefined;
  const previousDateKey = stringValue(userData.studyTodayDateKey);
  const previousStreak = numberValue(userData.studyStreakDays) ?? 0;
  const sameDay = previousDateKey === dateKey;
  const continuedFromYesterday = previousDateKey === addDaysToDateKey(dateKey, -1);
  const startedNewStreak = !sameDay && !continuedFromYesterday;
  const streakDays = sameDay
    ? Math.max(1, previousStreak)
    : continuedFromYesterday
      ? previousStreak + 1
      : 1;
  const todayActivityCount = sameDay
    ? (numberValue(userData.studyTodayActivityCount) ?? 0) + 1
    : 1;
  const todayModules = sameDay
    ? [...new Set([...parseModules(userData.studyTodayModules), input.module])]
    : [input.module];
  const previousTodayModuleCounts = sameDay
    ? parseModuleCounts(userData.studyTodayModuleCounts)
    : parseModuleCounts(null);
  const todayModuleCounts = {
    ...previousTodayModuleCounts,
    [input.module]: previousTodayModuleCounts[input.module] + 1,
  };
  const todayXp = sameDay
    ? (numberValue(userData.studyTodayXp) ?? 0) + xp
    : xp;
  const metricDelta: Record<string, number> = {};
  if (input.metric && COUNT_METRICS.includes(input.metric)) {
    metricDelta[input.metric] = Math.max(0, Math.trunc(numberValue(input.quantity) ?? 1));
  }
  const duration = numberValue(input.durationSeconds);
  if (duration != null && duration >= 0) metricDelta.studySeconds = Math.trunc(duration);
  const blankCounts = Object.fromEntries(COUNT_METRICS.map((metric) => [metric, 0]));
  const dailyMetrics = {
    ...(current?.metricsVersion === 1 ? {} : blankCounts),
    ...Object.fromEntries(Object.entries(metricDelta).map(([metric, quantity]) => [metric, FieldValue.increment(quantity)])),
  };
  const lifetimeMetrics = {
    ...(userData.studyMetricsVersion === 1 ? {} : blankCounts),
    ...Object.fromEntries(Object.entries(metricDelta).map(([metric, quantity]) => [metric, FieldValue.increment(quantity)])),
  };
  const previousTodayMetrics = sameDay && userData.studyTodayMetricsSinceMillis != null
    ? recordValue(userData.studyTodayMetrics) : blankCounts;
  const todayMetrics = {
    ...previousTodayMetrics,
    ...(!sameDay && metricDelta.studySeconds == null ? { studySeconds: FieldValue.delete() } : {}),
    ...Object.fromEntries(Object.entries(metricDelta).map(([metric, quantity]) => [metric, (numberValue(previousTodayMetrics[metric]) ?? 0) + quantity])),
  };
  const metricsIncomplete = current?.metricsIncomplete === true
    || (current?.metricsVersion !== 1 && (current?.activityCount ?? 0) > 0);
  const todayMetricsIncomplete = sameDay && (userData.studyTodayMetricsIncomplete === true
    || (userData.studyTodayMetricsSinceMillis == null && (numberValue(userData.studyTodayActivityCount) ?? 0) > 0));
  const storedModuleTotals = recordValue(userData.studyModuleTotals);
  const migratedModuleTotals = Object.fromEntries(COUNT_METRICS.flatMap((module) => {
    const legacyCount = numberValue(userData[`studyModuleTotals.${module}`]);
    return numberValue(storedModuleTotals[module]) == null && legacyCount != null ? [[module, legacyCount]] : [];
  }));

  tx.set(
    ref,
    {
      dateKey,
      activityCount: FieldValue.increment(1),
      metricsVersion: 1,
      metricsSinceMillis: current?.metricsSinceMillis ?? now,
      metricsIncomplete,
      modules: FieldValue.arrayUnion(input.module),
      activityTypes: FieldValue.arrayUnion(input.activityType),
      ...(sourceId ? { sourceIds: FieldValue.arrayUnion(sourceId) } : {}),
      firstActivityAtMillis: current?.firstActivityAtMillis ?? now,
      lastActivityAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
  tx.set(
    dailyRef,
    {
      dateKey,
      totalActivityCount: FieldValue.increment(1),
      xp: FieldValue.increment(xp),
      moduleCounts: { [input.module]: FieldValue.increment(1) },
      activityTypeCounts: { [input.activityType]: FieldValue.increment(1) },
      metrics: dailyMetrics,
      metricsVersion: 1,
      metricsSinceMillis: current?.metricsSinceMillis ?? now,
      metricsIncomplete,
      modules: FieldValue.arrayUnion(input.module),
      lastActivityAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  tx.set(
    userRef,
    {
      totalStudyXp: FieldValue.increment(xp),
      studyModuleTotals: {
        ...migratedModuleTotals,
        [input.module]: (numberValue(storedModuleTotals[input.module])
          ?? numberValue(userData[`studyModuleTotals.${input.module}`]) ?? 0) + 1,
      },
      totalStudyMetrics: lifetimeMetrics,
      studyMetricsVersion: 1,
      studyMetricsSinceMillis: numberValue(userData.studyMetricsSinceMillis) ?? now,
      studyTodayMetrics: todayMetrics,
      studyTodayMetricsSinceMillis: sameDay ? numberValue(userData.studyTodayMetricsSinceMillis) ?? now : now,
      studyTodayMetricsIncomplete: todayMetricsIncomplete,
      studyLongestStreakDays: Math.max(numberValue(userData.studyLongestStreakDays) ?? 0, previousStreak, streakDays),
      studyStreakDays: streakDays,
      studyStudiedToday: true,
      studyTodayActivityCount: todayActivityCount,
      studyTodayModules: todayModules,
      studyTodayModuleCounts: todayModuleCounts,
      studyTodayXp: todayXp,
      studyTodayDateKey: dateKey,
      studyStreakUpdatedAtMillis: now,
      lastStudyActivityAtMillis: now,
      ...(startedNewStreak ? { studyStreakMilestonesSeen: [] } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function claimStudyStreakMilestone(uid: string): Promise<number | null> {
  if (!uid?.trim()) return null;

  const userRef = adminDb.collection("users").doc(uid);
  const todayKey = dateKeyForMillis(Date.now());

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return null;

    const data = snap.data() ?? {};
    const streakDays = numberValue(data.studyStreakDays) ?? 0;
    const studiedToday = data.studyStudiedToday === true && stringValue(data.studyTodayDateKey) === todayKey;
    if (!studiedToday || !isStudyStreakMilestone(streakDays)) return null;

    const seenMilestones = Array.isArray(data.studyStreakMilestonesSeen)
      ? data.studyStreakMilestonesSeen.filter((value): value is number => typeof value === "number")
      : [];
    if (seenMilestones.includes(streakDays)) return null;

    tx.set(
      userRef,
      {
        studyStreakMilestonesSeen: FieldValue.arrayUnion(streakDays),
        studyStreakMilestoneLastShownAtMillis: Date.now(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return streakDays;
  });
}

export async function getTodayStudySummary(uid: string): Promise<StudyDailySummary> {
  if (!uid?.trim()) return emptyDailySummary();
  const todayKey = dateKeyForMillis(Date.now());
  const snap = await dailySummaryCollection(uid).doc(todayKey).get().catch(() => null);
  if (!snap?.exists) return emptyDailySummary(todayKey);
  const data = snap.data() ?? {};
  return {
    dateKey: todayKey,
    totalActivityCount: numberValue(data.totalActivityCount) ?? 0,
    xp: numberValue(data.xp) ?? 0,
    moduleCounts: parseModuleCounts(data.moduleCounts),
  };
}

export async function getStudyStreak(uid: string): Promise<StudyStreakSummary> {
  if (!uid?.trim()) {
    return emptySummary();
  }

  return readServerCache(
    () => readStudyStreak(uid),
    ["learner-study-streak", uid, dateKeyForMillis(Date.now())],
    { revalidate: 60, tags: [studyStreakCacheTag(uid)] },
  );
}

async function readStudyStreak(uid: string): Promise<StudyStreakSummary> {

  const snap = await activityCollection(uid)
    .orderBy("dateKey", "desc")
    .limit(STREAK_LOOKBACK_LIMIT)
    .get();

  const byDate = new Map<string, { activityCount: number; modules: StudyModule[]; lastActivityAtMillis: number | null }>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const dateKey = typeof data.dateKey === "string" ? data.dateKey : doc.id;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || (numberValue(data.activityCount) ?? 0) <= 0) continue;
    byDate.set(dateKey, {
      activityCount: typeof data.activityCount === "number" ? data.activityCount : 0,
      modules: parseModules(data.modules),
      lastActivityAtMillis: numberValue(data.lastActivityAtMillis),
    });
  }

  const todayKey = dateKeyForMillis(Date.now());
  const today = byDate.get(todayKey);
  let streakDays = 0;
  let expected = todayKey;

  if (!today) {
    expected = addDaysToDateKey(todayKey, -1);
  }
  const latestActiveDay = byDate.get(expected);

  while (byDate.has(expected)) {
    streakDays++;
    expected = addDaysToDateKey(expected, -1);
  }

  return {
    streakDays,
    studiedToday: Boolean(today),
    todayActivityCount: today?.activityCount ?? 0,
    todayModules: today?.modules ?? [],
    todayDateKey: todayKey,
    lastActivityAtMillis: latestActiveDay?.lastActivityAtMillis ?? null,
  };
}

export async function getStoredStudyStreakSummary(
  uid: string,
  maxAgeMs = SUMMARY_MAX_AGE_MS,
): Promise<StudyStreakSummary | null> {
  if (!uid?.trim()) return null;

  const safeMaxAgeMs = Math.max(0, Math.trunc(maxAgeMs));
  return readServerCache(
    () => readStoredStudyStreakSummary(uid, safeMaxAgeMs),
    ["learner-stored-study-streak", uid, dateKeyForMillis(Date.now()), String(safeMaxAgeMs)],
    { revalidate: 60, tags: [studyStreakCacheTag(uid)] },
  );
}

async function readStoredStudyStreakSummary(
  uid: string,
  maxAgeMs: number,
): Promise<StudyStreakSummary | null> {

  const snap = await adminDb.collection("users").doc(uid).get();
  if (!snap.exists) return null;

  const data = snap.data() ?? {};
  const todayKey = dateKeyForMillis(Date.now());
  const current = coherentProfileStudyStreak(data, todayKey, Date.now(), maxAgeMs);
  if (!current) return null;

  return {
    ...current,
    lastActivityAtMillis: numberValue(data.lastStudyActivityAtMillis),
    todayModules: current.studiedToday ? parseModules(data.studyTodayModules) : [],
  };
}

export async function refreshStudyStreakSummary(
  uid: string,
  summary?: StudyStreakSummary,
  lastActivityAtMillis?: number | null,
): Promise<StudyStreakSummary> {
  const next = summary ?? await getStudyStreak(uid);
  await adminDb.collection("users").doc(uid).set(
    {
      studyStreakDays: next.streakDays,
      studyStudiedToday: next.studiedToday,
      studyTodayActivityCount: next.todayActivityCount,
      studyTodayModules: next.todayModules,
      studyTodayDateKey: next.todayDateKey,
      studyStreakUpdatedAtMillis: Date.now(),
      ...(lastActivityAtMillis ? { lastStudyActivityAtMillis: lastActivityAtMillis } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return next;
}

export async function getStudyStreakLeaderboard(
  limit = 100,
): Promise<StudyStreakLeaderboardEntry[]> {
  return cachedStudyStreakLeaderboard(Math.max(1, Math.min(100, Math.trunc(limit))), dateKeyForMillis(Date.now()));
}

const cachedStudyStreakLeaderboard = unstable_cache(
  async (safeLimit: number, todayKey: string): Promise<StudyStreakLeaderboardEntry[]> => {
  const entries: StudyStreakLeaderboardEntry[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let cutoffStreak: number | undefined;
  let reachedCutoff = false;
  while (true) {
    let query = adminDb.collection("users").orderBy("studyStreakDays", "desc").limit(100);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const rawStreak = numberValue(data.studyStreakDays) ?? 0;
      if (rawStreak <= 0 || (cutoffStreak !== undefined && rawStreak < cutoffStreak)) {
        reachedCutoff = true;
        break;
      }
      const current = normalizeStudyStreak(data, todayKey);
      if (current.streakDays <= 0) continue;
      entries.push({
        rank: 0,
        uid: doc.id,
        displayName: stringValue(data.displayName),
        email: stringValue(data.email),
        avatarUrl: stringValue(data.avatarUrl),
        streakDays: current.streakDays,
        studiedToday: current.studiedToday,
        todayActivityCount: current.todayActivityCount,
        lastActivityAtMillis: numberValue(data.lastStudyActivityAtMillis),
      });
    }
    if (reachedCutoff || snap.docs.length < 100) break;
    if (entries.length >= safeLimit) {
      cutoffStreak = entries.map((entry) => entry.streakDays).sort((a, b) => b - a)[safeLimit - 1];
    }
    cursor = snap.docs[snap.docs.length - 1];
    const lastRawStreak = numberValue(cursor.data().studyStreakDays) ?? 0;
    // Read through ties so the activity/name ordering includes the whole cutoff group.
    if (lastRawStreak <= 0 || (cutoffStreak !== undefined && lastRawStreak < cutoffStreak)) break;
  }

  return entries
    .filter((entry) => entry.streakDays > 0)
    .sort((a, b) =>
      b.streakDays - a.streakDays ||
      (b.lastActivityAtMillis ?? 0) - (a.lastActivityAtMillis ?? 0) ||
      displayNameForSort(a).localeCompare(displayNameForSort(b)),
    )
    .slice(0, safeLimit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  },
  ["study-streak-leaderboard"],
  { revalidate: 60, tags: [STUDY_STREAK_LEADERBOARD_CACHE_TAG] },
);

function activityCollection(uid: string) {
  return adminDb.collection("users").doc(uid).collection(ACTIVITY_COLLECTION);
}

function dailySummaryCollection(uid: string) {
  return adminDb.collection("users").doc(uid).collection(DAILY_SUMMARY_COLLECTION);
}

function emptySummary(): StudyStreakSummary {
  return {
    streakDays: 0,
    studiedToday: false,
    todayActivityCount: 0,
    todayModules: [],
    todayDateKey: dateKeyForMillis(Date.now()),
  };
}

function emptyDailySummary(dateKey = dateKeyForMillis(Date.now())): StudyDailySummary {
  return {
    dateKey,
    totalActivityCount: 0,
    xp: 0,
    moduleCounts: {
      listening: 0,
      reading: 0,
      practice: 0,
      vocab: 0,
      writing: 0,
      video: 0,
    },
  };
}

function parseModuleCounts(value: unknown): Record<StudyModule, number> {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    listening: numberValue(data.listening) ?? 0,
    reading: numberValue(data.reading) ?? 0,
    practice: numberValue(data.practice) ?? 0,
    vocab: numberValue(data.vocab) ?? 0,
    writing: numberValue(data.writing) ?? 0,
    video: numberValue(data.video) ?? 0,
  };
}

function parseModules(value: unknown): StudyModule[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StudyModule =>
    item === "listening" ||
    item === "reading" ||
    item === "practice" ||
    item === "vocab" || item === "writing" || item === "video",
  );
}

function xpForActivity(module: StudyModule): number {
  return {
    listening: 10,
    reading: 10,
    practice: 20,
    vocab: 5,
    writing: 0,
    video: 0,
  }[module];
}

function dateKeyForMillis(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function displayNameForSort(entry: Pick<StudyStreakLeaderboardEntry, "displayName" | "email" | "uid">) {
  return entry.displayName ?? entry.email ?? entry.uid;
}
