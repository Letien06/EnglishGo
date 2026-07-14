/**
 * Hub / Dashboard service.
 *
 * Port of `service/HubService.java` + `service/DashboardService.java`.
 * Reads Firestore data for the authenticated user's dashboard.
 */
import { adminDb } from "@/lib/firestore/db";
import type { AppUser } from "@/types";
import { getStudyStreak, getTodayStudySummary } from "./study-activity";
import { refreshVocabHubSummary } from "./vocab";

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

/* ------------------------------------------------------------------ */
/*  Main hub function                                                  */
/* ------------------------------------------------------------------ */

export async function getHub(user: AppUser): Promise<HubView> {
  const uid = user.uid;
  const profileSnap = await adminDb.collection("users").doc(uid).get().catch(() => null);
  const profile = profileSnap?.exists ? profileSnap.data() ?? {} : {};
  const now = Date.now();
  const todayKey = dateKeyForMillis(now);
  const profileIsToday = profile.studyTodayDateKey === todayKey;
  const hasTodaySummary =
    profileIsToday &&
    profile.studyTodayModuleCounts != null &&
    numberValue(profile.studyTodayXp) != null;
  const storedMastered = numberValue(profile.vocabMasteredWords);
  const storedDue = numberValue(profile.vocabDueWords);
  const storedNextDue = numberValue(profile.vocabNextDueAtMillis);
  const vocabSummaryFresh =
    storedMastered != null &&
    storedDue != null &&
    (storedNextDue == null || storedNextDue > now);

  const [practiceSummary, studyStreak, todaySummary, vocabSummary] = await Promise.all([
    loadPracticeSummary(uid, profile),
    profileIsToday
      ? Promise.resolve({
          streakDays: numberValue(profile.studyStreakDays) ?? 0,
          studiedToday: profile.studyStudiedToday === true,
          todayActivityCount: numberValue(profile.studyTodayActivityCount) ?? 0,
          todayModules: [],
          todayDateKey: todayKey,
        })
      : getStudyStreak(uid),
    hasTodaySummary
      ? Promise.resolve({
          dateKey: todayKey,
          totalActivityCount: numberValue(profile.studyTodayActivityCount) ?? 0,
          xp: numberValue(profile.studyTodayXp) ?? 0,
          moduleCounts: parseModuleTotals(profile.studyTodayModuleCounts),
        })
      : getTodayStudySummary(uid),
    vocabSummaryFresh
      ? Promise.resolve({ masteredWords: storedMastered, dueWords: storedDue })
      : refreshVocabHubSummary(uid).catch(() => ({ masteredWords: 0, dueWords: 0 })),
  ]);

  const profileName = (profile.displayName as string) || null;
  const targetScore = typeof profile.targetScore === "number" ? profile.targetScore : null;
  const level = (profile.level as string) || null;
  const todayCompleted = todaySummary.totalActivityCount || studyStreak.todayActivityCount;
  const nextRecommendation = toRecommendation(profile.nextPracticeRecommendation)
    ?? buildRecommendation({
      dueVocabWords: vocabSummary.dueWords,
      completedTests: practiceSummary.completedTests,
      averageScore: practiceSummary.averageScore,
      dailyGoalCompleted: todayCompleted,
    });
  const moduleTotals = parseModuleTotals(profile.studyModuleTotals);
  const lastActivityAtMillis = numberValue(profile.lastStudyActivityAtMillis);

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
    dueVocabWords: vocabSummary.dueWords,
    nextRecommendation,
    streakDays: studyStreak.streakDays,
    completedTests: practiceSummary.completedTests,
    averageScore: practiceSummary.averageScore,
    targetScore,
    level,
    masteredWords: vocabSummary.masteredWords,
  };
}

function dateKeyForMillis(millis: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(millis));
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

function buildRecommendation(input: {
  dueVocabWords: number;
  completedTests: number;
  averageScore: number;
  dailyGoalCompleted: number;
}): NonNullable<HubView["nextRecommendation"]> {
  if (input.dueVocabWords > 0) {
    return {
      label: `Ôn ${input.dueVocabWords} từ đến hạn`,
      href: "/vocab?tab=progress",
      reason: "Ôn đúng lúc giúp ghi nhớ từ vựng lâu hơn trước khi mở bài mới.",
    };
  }
  if (input.completedTests === 0) {
    return {
      label: "Làm bài chẩn đoán đầu tiên",
      href: "/practice",
      reason: "Một bài luyện ngắn giúp hệ thống nhận ra điểm cần ưu tiên của bạn.",
    };
  }
  if (input.averageScore < 600) {
    return {
      label: "Củng cố nền tảng bằng một Part ngắn",
      href: "/practice",
      reason: "Chia bài luyện thành Part nhỏ giúp cải thiện điểm yếu mà không quá tải.",
    };
  }
  if (input.dailyGoalCompleted === 0) {
    return {
      label: "Khởi động 15 phút nghe tiếng Anh",
      href: "/listen",
      reason: "Một phiên ngắn hôm nay giúp giữ nhịp học và chuỗi ngày của bạn.",
    };
  }
  return {
    label: "Tiếp tục lộ trình học hôm nay",
    href: "/continue",
    reason: "Bạn đã hoàn thành mục tiêu trước mắt; hãy tiếp tục từ hoạt động gần nhất.",
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
