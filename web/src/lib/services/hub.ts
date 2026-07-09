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
  dailyGoalTarget: number;
  dailyGoalCompleted: number;
  dailyGoalPercent: number;
  todayXp: number;
  totalXp: number;
  todayListening: number;
  todayReading: number;
  todayPractice: number;
  todayVocab: number;
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
  totalWords: number;
}

/* ------------------------------------------------------------------ */
/*  Dashboard summary (port of DashboardService)                       */
/* ------------------------------------------------------------------ */

interface AttemptDoc {
  score: number;
  submittedAtMillis: number | null;
}

async function loadSubmittedAttempts(uid: string): Promise<AttemptDoc[]> {
  try {
    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("practiceAttempts")
      .get();

    return snap.docs
      .map((doc) => {
        const data = doc.data();
        const score = typeof data.score === "number" ? data.score : 0;
        const submittedAtMillis =
          typeof data.submittedAtMillis === "number"
            ? data.submittedAtMillis
            : null;
        return { score, submittedAtMillis };
      })
      .filter((a) => a.submittedAtMillis !== null);
  } catch {
    return [];
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

const DAILY_ACTIVITY_TARGET = 10;

export async function getHub(user: AppUser): Promise<HubView> {
  const uid = user.uid;
  const [profileSnap, attempts, studyStreak, todaySummary, masteredWords, dueVocabWords] = await Promise.all([
    adminDb.collection("users").doc(uid).get().catch(() => null),
    loadSubmittedAttempts(uid),
    getStoredStudyStreakSummary(uid).then((summary) => summary ?? getStudyStreak(uid)),
    getTodayStudySummary(uid),
    countMasteredWords(uid),
    dueWords(uid).catch(() => 0),
  ]);

  const profile = profileSnap?.exists ? profileSnap.data() ?? {} : {};
  const profileName = (profile.displayName as string) || null;
  const targetScore = typeof profile.targetScore === "number" ? profile.targetScore : null;
  const level = (profile.level as string) || null;
  const nextRecommendation = toRecommendation(profile.nextPracticeRecommendation);
  const todayCompleted = todaySummary.totalActivityCount || studyStreak.todayActivityCount;
  const goalPercent = Math.min(
    100,
    Math.round((todayCompleted * 100) / Math.max(DAILY_ACTIVITY_TARGET, 1)),
  );

  // Average score
  const avgScore =
    attempts.length > 0
      ? Math.round(
          (attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) *
            100,
        ) / 100
      : 0;

  // Greeting name
  const greetingName = profileName || user.displayName || user.email;

  return {
    greetingName,
    dailyGoalTarget: DAILY_ACTIVITY_TARGET,
    dailyGoalCompleted: todayCompleted,
    dailyGoalPercent: goalPercent,
    todayXp: todaySummary.xp,
    totalXp: numberValue(profile.totalStudyXp) ?? attempts.length * 5,
    todayListening: todaySummary.moduleCounts.listening,
    todayReading: todaySummary.moduleCounts.reading,
    todayPractice: todaySummary.moduleCounts.practice,
    todayVocab: todaySummary.moduleCounts.vocab,
    dueVocabWords,
    nextRecommendation,
    streakDays: studyStreak.streakDays,
    completedTests: attempts.length,
    averageScore: avgScore,
    targetScore,
    level,
    masteredWords,
    totalWords: 0,
  };
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
