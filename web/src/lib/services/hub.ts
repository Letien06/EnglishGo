/**
 * Hub / Dashboard service.
 *
 * Port of `service/HubService.java` + `service/DashboardService.java`.
 * Reads Firestore data for the authenticated user's dashboard.
 */
import { adminDb } from "@/lib/firestore/db";
import type { AppUser } from "@/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HubView {
  greetingName: string;
  dailyGoalTarget: number;
  dailyGoalCompleted: number;
  dailyGoalPercent: number;
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

function calculateStreak(attempts: AttemptDoc[]): number {
  if (attempts.length === 0) return 0;

  const days = [
    ...new Set(
      attempts
        .filter((a) => a.submittedAtMillis !== null)
        .map((a) => {
          const d = new Date(a.submittedAtMillis!);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        }),
    ),
  ].sort().reverse();

  if (days.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  let expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  for (const day of days) {
    if (day === expected) {
      streak++;
      // Go to previous day
      const prev = new Date(expected);
      prev.setDate(prev.getDate() - 1);
      expected = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
    } else if (streak === 0) {
      // Allow yesterday as start
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      if (day === yesterdayStr) {
        streak = 1;
        const prev = new Date(yesterday);
        prev.setDate(prev.getDate() - 1);
        expected = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return streak;
}

async function countMasteredWords(uid: string): Promise<number> {
  try {
    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("vocabProgress")
      .get();

    return snap.docs.filter((doc) => {
      const status = doc.data().status;
      return typeof status === "string" && status.toUpperCase() === "MASTERED";
    }).length;
  } catch {
    return 0;
  }
}

function countCompletedToday(attempts: AttemptDoc[]): number {
  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const endOfDay = startOfDay + 86400000;

  return attempts.filter(
    (a) =>
      a.submittedAtMillis !== null &&
      a.submittedAtMillis >= startOfDay &&
      a.submittedAtMillis < endOfDay,
  ).length;
}

/* ------------------------------------------------------------------ */
/*  Main hub function                                                  */
/* ------------------------------------------------------------------ */

const DAILY_GOAL_TARGET = 1;

export async function getHub(user: AppUser): Promise<HubView> {
  const uid = user.uid;

  // Load profile
  let profileName: string | null = null;
  let targetScore: number | null = null;
  let level: string | null = null;

  try {
    const profileSnap = await adminDb.collection("users").doc(uid).get();
    if (profileSnap.exists) {
      const data = profileSnap.data()!;
      profileName = (data.displayName as string) || null;
      targetScore = typeof data.targetScore === "number" ? data.targetScore : null;
      level = (data.level as string) || null;
    }
  } catch {
    // ignore
  }

  // Load attempts
  const attempts = await loadSubmittedAttempts(uid);
  const todayCompleted = countCompletedToday(attempts);
  const goalPercent = Math.min(
    100,
    Math.round((todayCompleted * 100) / Math.max(DAILY_GOAL_TARGET, 1)),
  );

  // Average score
  const avgScore =
    attempts.length > 0
      ? Math.round(
          (attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) *
            100,
        ) / 100
      : 0;

  // Streak
  const streakDays = calculateStreak(attempts);

  // Mastered words
  const masteredWords = await countMasteredWords(uid);

  // Greeting name
  const greetingName = profileName || user.displayName || user.email;

  return {
    greetingName,
    dailyGoalTarget: DAILY_GOAL_TARGET,
    dailyGoalCompleted: todayCompleted,
    dailyGoalPercent: goalPercent,
    streakDays,
    completedTests: attempts.length,
    averageScore: avgScore,
    targetScore,
    level,
    masteredWords,
    totalWords: 0,
  };
}
