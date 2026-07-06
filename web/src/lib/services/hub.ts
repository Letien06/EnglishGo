/**
 * Hub / Dashboard service.
 *
 * Port of `service/HubService.java` + `service/DashboardService.java`.
 * Reads Firestore data for the authenticated user's dashboard.
 */
import { adminDb } from "@/lib/firestore/db";
import type { AppUser } from "@/types";
import { getStudyStreak } from "./study-activity";

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
  const [attempts, studyStreak] = await Promise.all([
    loadSubmittedAttempts(uid),
    getStudyStreak(uid),
  ]);
  const todayCompleted = studyStreak.todayActivityCount;
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

  // Mastered words
  const masteredWords = await countMasteredWords(uid);

  // Greeting name
  const greetingName = profileName || user.displayName || user.email;

  return {
    greetingName,
    dailyGoalTarget: DAILY_GOAL_TARGET,
    dailyGoalCompleted: todayCompleted,
    dailyGoalPercent: goalPercent,
    streakDays: studyStreak.streakDays,
    completedTests: attempts.length,
    averageScore: avgScore,
    targetScore,
    level,
    masteredWords,
    totalWords: 0,
  };
}
