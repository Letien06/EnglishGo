/**
 * Hub / Dashboard service.
 *
 * Port of `service/HubService.java` + `service/DashboardService.java`.
 * Reads Firestore data for the authenticated user's dashboard.
 */
import { adminDb } from "@/lib/firestore/db";
import type { AppUser } from "@/types";
import { getStoredStudyStreakSummary, getStudyStreak, getTodayStudySummary } from "./study-activity";
import { dueWords } from "./vocab";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HubView {
  greetingName: string;
  dailyGoalCompleted: number;
  todayXp: number;
  totalXp: number;
  todayListening: number;
  todayReading: number;
  todayPractice: number;
  todayVocab: number;
  moduleTotals: Record<"listening" | "reading" | "practice" | "vocab", number>;
  lastActivityAtMillis: number | null;
  dueVocabWords: number;
  nextRecommendation: {
    label: string;
    href: string;
    reason: string;
  } | null;
  streakDays: number;
  completedTests: number;
  averageScore: number;
  targetScore: number | null;
  level: string | null;
  masteredWords: number;
}

/* ------------------------------------------------------------------ */
/*  Dashboard summary (port of DashboardService)                       */
/* ------------------------------------------------------------------ */

interface PracticeSummary {
  completedTests: number;
  averageScore: number;
}

async function loadPracticeSummary(
  uid: string,
  profile: Record<string, unknown>,
): Promise<PracticeSummary> {
  const aggregateCount = numberValue(profile.practiceCompletedTests);
  const aggregateAverage = numberValue(profile.practiceAverageScore);
  if (aggregateCount != null && aggregateAverage != null) {
    return {
      completedTests: aggregateCount,
      averageScore: aggregateAverage,
    };
  }

  try {
    const base = adminDb
      .collection("users")
      .doc(uid)
      .collection("practiceAttempts");
    const [recentSnap, countSnap] = await Promise.all([
      base.orderBy("submittedAtMillis", "desc").limit(50).get(),
      base.count().get(),
    ]);
    const scores = recentSnap.docs
      .map((doc) => numberValue(doc.get("score")) ?? 0)
      .filter((score) => score > 0);
    const averageScore = scores.length > 0
      ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
      : 0;
    return {
      completedTests: countSnap.data().count,
      averageScore,
    };
  } catch {
    return {
      completedTests: 0,
      averageScore: 0,
    };
  }
}

async function countMasteredWords(uid: string): Promise<number> {
  try {
    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("userVocabProgress")
      .where("status", "==", "MASTERED")
      .count()
      .get();

    return snap.data().count;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Main hub function                                                  */
/* ------------------------------------------------------------------ */

export async function getHub(user: AppUser): Promise<HubView> {
  const uid = user.uid;
  const [profileSnap, studyStreak, todaySummary, masteredWords, dueVocabWords] = await Promise.all([
    adminDb.collection("users").doc(uid).get().catch(() => null),
    getStoredStudyStreakSummary(uid).then((summary) => summary ?? getStudyStreak(uid)),
    getTodayStudySummary(uid),
    countMasteredWords(uid),
    dueWords(uid).catch(() => 0),
  ]);

  const profile = profileSnap?.exists ? profileSnap.data() ?? {} : {};
  const profileName = (profile.displayName as string) || null;
  const targetScore = typeof profile.targetScore === "number" ? profile.targetScore : null;
  const level = (profile.level as string) || null;
  const practiceSummary = await loadPracticeSummary(uid, profile);
  const nextRecommendation = toRecommendation(profile.nextPracticeRecommendation);
  const moduleTotals = parseModuleTotals(profile.studyModuleTotals);
  const lastActivityAtMillis = numberValue(profile.lastStudyActivityAtMillis);
  const todayCompleted = todaySummary.totalActivityCount || studyStreak.todayActivityCount;

  // Greeting name
  const greetingName = profileName || user.displayName || user.email;

  return {
    greetingName,
    dailyGoalCompleted: todayCompleted,
    todayXp: todaySummary.xp,
    totalXp: numberValue(profile.totalStudyXp) ?? 0,
    todayListening: todaySummary.moduleCounts.listening,
    todayReading: todaySummary.moduleCounts.reading,
    todayPractice: todaySummary.moduleCounts.practice,
    todayVocab: todaySummary.moduleCounts.vocab,
    moduleTotals,
    lastActivityAtMillis,
    dueVocabWords,
    nextRecommendation,
    streakDays: studyStreak.streakDays,
    completedTests: practiceSummary.completedTests,
    averageScore: practiceSummary.averageScore,
    targetScore,
    level,
    masteredWords,
  };
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseModuleTotals(value: unknown): HubView["moduleTotals"] {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    listening: numberValue(data.listening) ?? 0,
    reading: numberValue(data.reading) ?? 0,
    practice: numberValue(data.practice) ?? 0,
    vocab: numberValue(data.vocab) ?? 0,
  };
}

function toRecommendation(value: unknown): HubView["nextRecommendation"] {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const label = stringValue(data.label);
  const href = stringValue(data.href);
  const reason = stringValue(data.reason);
  if (!label || !href || !reason) return null;
  return { label, href, reason };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
