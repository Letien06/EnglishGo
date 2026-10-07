import { coherentProfileStudyStreak } from "@/lib/study-streak";
import { getStudyStreak } from "./study-activity";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firestore/db";
import { BadRequest, Unauthorized } from "@/lib/api/response";
import { invalidateCurrentUserProfileCache } from "@/lib/auth/session";
import { readServerCache } from "@/lib/server-cache";
import { dashboardCacheTag, invalidateLearnerActivityCaches } from "./learner-cache";
import { dashboardDateKey, dashboardRange, defaultDashboardPreferences, isDashboardDate, type DashboardMetrics, type DashboardPeriod, type DashboardPreferences, type DashboardStats, type DashboardView, type GoalKey } from "@/lib/dashboard-model";

const score = z.number().int().min(0).max(990).multipleOf(5);
const goal = (max: number) => z.object({ enabled: z.boolean(), target: z.number().int().min(1).max(max) }).strict();
export const dashboardPreferencesSchema = z.object({
  currentScore: score.nullable().optional(),
  targetScore: score.optional(),
  examDate: z.string().refine(isDashboardDate, "Invalid exam date").nullable().optional(),
  dailyGoals: z.object({ reading: goal(200), listening: goal(200), vocab: goal(400), practice: goal(1000), video: goal(20) }).strict().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "No preferences provided");
export type DashboardPreferencesUpdate = z.infer<typeof dashboardPreferencesSchema>;

const countKeys = ["reading", "listening", "practice", "vocab", "writing", "video"] as const;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function preferencesFromProfile(profile: Record<string, unknown>): DashboardPreferences {
  const defaults = defaultDashboardPreferences();
  const saved = object(profile.dashboardPreferences);
  const goals = object(saved.dailyGoals);
  const dailyGoals = { ...defaults.dailyGoals };
  const limits: Record<GoalKey, number> = { reading: 200, listening: 200, vocab: 400, practice: 1000, video: 20 };
  for (const key of Object.keys(limits) as GoalKey[]) {
    const parsed = goal(limits[key]).safeParse(goals[key]);
    if (parsed.success) dailyGoals[key] = parsed.data;
  }
  const currentScore = score.nullable().safeParse(Object.hasOwn(saved, "currentScore") ? saved.currentScore : profile.currentScore ?? null);
  const targetScore = score.safeParse(saved.targetScore ?? profile.targetScore);
  const examDate = Object.hasOwn(saved, "examDate") ? saved.examDate : profile.examDate;
  return { currentScore: currentScore.success ? currentScore.data : null, targetScore: targetScore.success ? targetScore.data : defaults.targetScore, examDate: typeof examDate === "string" && isDashboardDate(examDate) ? examDate : null, dailyGoals };
}

export function metricsFromDailySummary(data?: Record<string, unknown>): DashboardMetrics {
  const metrics = object(data?.metrics);
  const measured = data?.metricsVersion === 1;
  const activities = number(data?.totalActivityCount) ?? 0;
  const since = number(data?.metricsSinceMillis);
  const result = { activities, xp: number(data?.xp) ?? 0, studySeconds: number(metrics.studySeconds), speaking: null, measurementSince: measured ? since !== null ? dashboardDateKey(since) : typeof data?.dateKey === "string" ? data.dateKey : null : null, hasLegacyData: activities > 0 && (!measured || data?.metricsIncomplete === true) } as DashboardMetrics;
  for (const key of countKeys) result[key] = !data || activities === 0 ? 0 : measured ? number(metrics[key]) : null;
  return result;
}

export function aggregateDashboardMetrics(rows: Record<string, unknown>[]): DashboardMetrics {
  const total = metricsFromDailySummary();
  const measuredKeys = new Set<typeof countKeys[number]>();
  for (const row of rows) {
    const next = metricsFromDailySummary(row);
    for (const key of countKeys) {
      if (next[key] !== null) total[key] = (total[key] ?? 0) + next[key];
      if (row.metricsVersion === 1 && next[key] !== null) measuredKeys.add(key);
    }
    total.activities += next.activities;
    total.xp += next.xp;
    if (next.studySeconds !== null) total.studySeconds = (total.studySeconds ?? 0) + next.studySeconds;
    total.hasLegacyData ||= next.hasLegacyData;
    if (next.measurementSince && (!total.measurementSince || next.measurementSince < total.measurementSince)) total.measurementSince = next.measurementSince;
  }
  if (total.hasLegacyData) for (const key of countKeys) if (!measuredKeys.has(key)) total[key] = null;
  return total;
}

export async function getDashboardView(uid: string, greetingName?: string): Promise<DashboardView> {
  if (!uid?.trim()) throw Unauthorized("Authentication required");
  const todayDateKey = dashboardDateKey();
  return readServerCache(async () => {
    const userRef = adminDb.collection("users").doc(uid);
    const [profileSnapshot, todaySnapshot] = await Promise.all([userRef.get(), userRef.collection("dailySummaries").doc(todayDateKey).get()]);
    const profile = profileSnapshot.data() ?? {};
    const today = metricsFromDailySummary(todaySnapshot.exists ? todaySnapshot.data() : undefined);
    const streak = coherentProfileStudyStreak(profile, todayDateKey) ?? await getStudyStreak(uid);
    const dueVocabWords = number(profile.vocabDueWords);
    return { greetingName: greetingName || (typeof profile.displayName === "string" ? profile.displayName : "Bạn"), todayDateKey, preferences: preferencesFromProfile(profile), today, stats: today, streakDays: streak.streakDays, longestStreakDays: number(profile.studyLongestStreakDays), totalXp: number(profile.totalStudyXp) ?? 0, ...(dueVocabWords !== null ? { dueVocabWords } : {}) };
  }, ["dashboard-view", uid, todayDateKey, greetingName ?? ""], { revalidate: 60, tags: [dashboardCacheTag(uid)] });
}

export async function getDashboardStats(uid: string, period: DashboardPeriod, start?: string, end?: string): Promise<DashboardStats> {
  if (!uid?.trim()) throw Unauthorized("Authentication required");
  let range: { start: string; end: string };
  try { range = dashboardRange(period, start, end); } catch { throw BadRequest("Invalid dashboard date range"); }
  return readServerCache(async () => {
    const summaries = adminDb.collection("users").doc(uid).collection("dailySummaries");
    if (range.start === range.end) {
      const snapshot = await summaries.doc(range.start).get();
      const metrics = metricsFromDailySummary(snapshot.exists ? snapshot.data() : undefined);
      return { metrics, ...range, coverageFrom: metrics.measurementSince ?? null, partialHistory: metrics.hasLegacyData ?? false };
    }
    const snapshot = await summaries.where("dateKey", ">=", range.start).where("dateKey", "<=", range.end).orderBy("dateKey", "asc").get();
    const metrics = aggregateDashboardMetrics(snapshot.docs.map((doc) => doc.data()));
    return { metrics, ...range, coverageFrom: metrics.measurementSince ?? null, partialHistory: metrics.hasLegacyData ?? false };
  }, ["dashboard-stats", uid, range.start, range.end], { revalidate: 60, tags: [dashboardCacheTag(uid)] });
}

export async function updateDashboardPreferences(uid: string, input: unknown): Promise<DashboardPreferences> {
  if (!uid?.trim()) throw Unauthorized("Authentication required");
  const parsed = dashboardPreferencesSchema.safeParse(input);
  if (!parsed.success) throw BadRequest("Invalid dashboard preferences");
  const userRef = adminDb.collection("users").doc(uid);
  const preferences = await adminDb.runTransaction(async (tx) => {
    const snapshot = await tx.get(userRef);
    const next = { ...preferencesFromProfile(snapshot.data() ?? {}), ...parsed.data };
    tx.set(userRef, { dashboardPreferences: next, targetScore: next.targetScore, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  invalidateCurrentUserProfileCache();
  invalidateLearnerActivityCaches(uid);
  return preferences;
}
