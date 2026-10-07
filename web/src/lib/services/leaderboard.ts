import { FieldValue } from "firebase-admin/firestore";
import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firestore/db";
import type {
  PracticeScoreBreakdown,
  PracticeSessionConfig,
} from "./practice";

export type PracticeLeaderboardScope =
  | "LISTENING"
  | "READING"
  | "EXAM"
  | "PART_PRACTICE";

export type PracticeLeaderboardEligibility =
  | "VERIFIED"
  | "PRACTICE_RETRY"
  | "SUSPICIOUS";

export type PracticeLeaderboardPeriod = "ALL_TIME" | "WEEKLY";

export interface PracticeLeaderboardDecision {
  scope: PracticeLeaderboardScope;
  eligibility: PracticeLeaderboardEligibility;
  officialConfig: boolean;
  canonicalAttemptKey: string;
  leaderboardScore: number;
  leaderboardMaxScore: number;
  rawCorrect: number;
  rawTotal: number;
  unansweredCount: number;
  retryIndex: number;
  ineligibleReason: string | null;
}

export interface PracticeLeaderboardAttempt extends PracticeLeaderboardDecision {
  uid: string;
  email: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  attemptId: number;
  testId: number;
  title: string;
  elapsedMillis: number;
  submittedAtMillis: number;
}

export interface PracticeLeaderboardEntry {
  rank: number;
  uid: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  score: number;
  maxScore: number;
  correctCount: number;
  questionCount: number;
  unansweredCount: number;
  elapsedMillis: number;
  attemptId: number;
  testId: number;
  title: string | null;
  scope: PracticeLeaderboardScope;
  period: PracticeLeaderboardPeriod;
  updatedAtMillis: number | null;
}

export interface SkillQuestionLeaderboardInput {
  uid: string;
  module: "listening" | "reading";
  part: number;
  level: number;
  itemId: string;
  questionId: string;
  correct: boolean;
  occurredAtMillis: number;
  elapsedMillis?: number | null;
}

const LISTENING_PARTS = [1, 2, 3, 4];
const READING_PARTS = [5, 6, 7];
const EXAM_PARTS = [1, 2, 3, 4, 5, 6, 7];
const DEFAULT_FULL_TEST_MINUTES = 120;
const MIN_REASONABLE_MILLIS_BY_SCOPE: Record<PracticeLeaderboardScope, number> = {
  LISTENING: 5 * 60 * 1000,
  READING: 5 * 60 * 1000,
  EXAM: 10 * 60 * 1000,
  PART_PRACTICE: 0,
};

export function summarizePracticeLeaderboardAttempt(input: {
  testId: number;
  config: PracticeSessionConfig;
  scoreBreakdown: PracticeScoreBreakdown;
  correctCount: number;
  questionCount: number;
  unansweredCount: number;
  elapsedMillis: number;
  expired: boolean;
}): PracticeLeaderboardDecision {
  const scope = inferPracticeLeaderboardScope(input.config);
  const score = scoreForScope(scope, input.scoreBreakdown);
  const officialConfig = isOfficialPracticeConfig(scope, input.config);
  const canonicalAttemptKey = [
    input.testId,
    scope,
    officialConfig ? "official" : "practice",
  ].join("_");

  let eligibility: PracticeLeaderboardEligibility = "VERIFIED";
  let ineligibleReason: string | null = null;

  if (input.expired) {
    eligibility = "SUSPICIOUS";
    ineligibleReason = "expired";
  } else if (scope === "PART_PRACTICE" || !officialConfig || !score) {
    eligibility = "PRACTICE_RETRY";
    ineligibleReason = "not_official_scope";
  } else if (input.elapsedMillis < MIN_REASONABLE_MILLIS_BY_SCOPE[scope]) {
    eligibility = "SUSPICIOUS";
    ineligibleReason = "too_fast";
  }

  return {
    scope,
    eligibility,
    officialConfig,
    canonicalAttemptKey,
    leaderboardScore: score?.score ?? 0,
    leaderboardMaxScore: score?.maxScore ?? 0,
    rawCorrect: input.correctCount,
    rawTotal: input.questionCount,
    unansweredCount: input.unansweredCount,
    retryIndex: 1,
    ineligibleReason,
  };
}

export async function buildPracticeLeaderboardDecision(
  uid: string,
  input: Parameters<typeof summarizePracticeLeaderboardAttempt>[0],
): Promise<PracticeLeaderboardDecision> {
  const decision = summarizePracticeLeaderboardAttempt(input);
  if (decision.eligibility !== "VERIFIED") {
    return decision;
  }

  const previous = await adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceAttempts")
    .where("canonicalAttemptKey", "==", decision.canonicalAttemptKey)
    .where("eligibility", "==", "VERIFIED")
    .limit(1)
    .get();

  if (!previous.empty) {
    return {
      ...decision,
      eligibility: "PRACTICE_RETRY",
      retryIndex: 2,
      ineligibleReason: "same_test_retry",
    };
  }

  return decision;
}

export async function recordPracticeLeaderboardAttempt(
  attempt: PracticeLeaderboardAttempt,
): Promise<void> {
  if (attempt.eligibility !== "VERIFIED") return;
  if (attempt.scope === "PART_PRACTICE") return;
  if (attempt.leaderboardScore <= 0 || attempt.leaderboardMaxScore <= 0) return;

  await Promise.all([
    updateBoardEntry(attempt, "ALL_TIME"),
    updateBoardEntry(attempt, "WEEKLY"),
  ]);
}

export async function recordSkillQuestionLeaderboard(
  input: SkillQuestionLeaderboardInput,
): Promise<void> {
  if (!input.uid?.trim() || !input.correct) return;
  const userRef = adminDb.collection("users").doc(input.uid);
  await adminDb.runTransaction(async (tx) => {
    const [userSnap, writeAward] = await Promise.all([
      tx.get(userRef), prepareSkillQuestionLeaderboardWrite(tx, input),
    ]);
    writeAward(userSnap.data() ?? {});
  });
}

/** Read before composing any writes; the returned writer performs no reads. */
export async function prepareSkillQuestionLeaderboardWrite(
  tx: FirebaseFirestore.Transaction,
  input: SkillQuestionLeaderboardInput,
): Promise<(userData: Record<string, unknown>) => void> {
  if (!input.uid?.trim() || !input.correct) return () => {};
  const scope: PracticeLeaderboardScope = input.module === "listening" ? "LISTENING" : "READING";
  const points = Math.max(1, Math.min(50, Math.trunc(input.level) * 10));
  const userRef = adminDb.collection("users").doc(input.uid);
  // Freeze the week for both document references and payloads across retries.
  const weekKey = currentWeekKey(new Date(input.occurredAtMillis));
  const awardRef = userRef
    .collection("leaderboardQuestionAwards")
    .doc(skillQuestionAwardId(input.module, input.questionId));
  const allTimeRef = boardEntryRef(input.uid, scope, "ALL_TIME");
  const weeklyRef = adminDb.collection("leaderboards").doc(`${scope.toLowerCase()}_weekly_${weekKey}`).collection("entries").doc(input.uid);
  const award = await tx.get(awardRef);
  if (award.exists) return () => {};
  const [allTime, weekly] = await Promise.all([tx.get(allTimeRef), tx.get(weeklyRef)]);
  return (userData) => {
    if (award.exists) return;

    tx.set(awardRef, {
      module: input.module,
      scope,
      part: input.part,
      level: input.level,
      itemId: input.itemId,
      questionId: input.questionId,
      points,
      awardedAtMillis: input.occurredAtMillis,
      awardedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      allTimeRef,
      skillBoardPayload(input, scope, points, "ALL_TIME", userData, allTime.data() ?? {}),
      { merge: true },
    );
    tx.set(
      weeklyRef,
      skillBoardPayload(input, scope, points, "WEEKLY", userData, weekly.data() ?? {}, weekKey),
      { merge: true },
    );
  };
}

export async function getPracticeLeaderboard(
  scope: PracticeLeaderboardScope,
  period: PracticeLeaderboardPeriod = "ALL_TIME",
  limit = 100,
): Promise<PracticeLeaderboardEntry[]> {
  return cachedPracticeLeaderboard(scope, period, Math.max(1, Math.min(100, Math.trunc(limit))));
}

const cachedPracticeLeaderboard = unstable_cache(
  async (
    scope: PracticeLeaderboardScope,
    period: PracticeLeaderboardPeriod,
    safeLimit: number,
  ): Promise<PracticeLeaderboardEntry[]> => {
  const boardId = boardIdFor(scope, period);
  const snap = await adminDb
    .collection("leaderboards")
    .doc(boardId)
    .collection("entries")
    .orderBy("score", "desc")
    .limit(safeLimit)
    .get();

  return snap.docs
    .map((doc) => toLeaderboardEntry(doc, scope, period))
    .sort(compareEntries)
    .slice(0, safeLimit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  },
  ["practice-leaderboard"],
  { revalidate: 60 },
);

export function normalizeLeaderboardScope(value?: string | null): PracticeLeaderboardScope {
  const normalized = value?.toLowerCase();
  if (normalized === "listening") return "LISTENING";
  if (normalized === "reading") return "READING";
  if (normalized === "exam") return "EXAM";
  return "EXAM";
}

export function normalizeLeaderboardPeriod(value?: string | null): PracticeLeaderboardPeriod {
  return value?.toLowerCase() === "weekly" ? "WEEKLY" : "ALL_TIME";
}

export function practiceLeaderboardLabel(scope: PracticeLeaderboardScope): string {
  return {
    LISTENING: "Nghe",
    READING: "Đọc",
    EXAM: "Đề thi",
    PART_PRACTICE: "Luyện tập",
  }[scope];
}

function inferPracticeLeaderboardScope(config: Pick<PracticeSessionConfig, "mode" | "parts">): PracticeLeaderboardScope {
  if (sameParts(config.parts, EXAM_PARTS) && config.mode === "exam") return "EXAM";
  if (sameParts(config.parts, LISTENING_PARTS)) return "LISTENING";
  if (sameParts(config.parts, READING_PARTS)) return "READING";
  return "PART_PRACTICE";
}

function isOfficialPracticeConfig(
  scope: PracticeLeaderboardScope,
  config: Pick<PracticeSessionConfig, "durationMinutes" | "parts">,
): boolean {
  if (scope === "EXAM") {
    return sameParts(config.parts, EXAM_PARTS) && config.durationMinutes === DEFAULT_FULL_TEST_MINUTES;
  }
  if (scope === "LISTENING") return sameParts(config.parts, LISTENING_PARTS);
  if (scope === "READING") return sameParts(config.parts, READING_PARTS);
  return false;
}

function scoreForScope(
  scope: PracticeLeaderboardScope,
  scoreBreakdown: PracticeScoreBreakdown,
): { score: number; maxScore: number } | null {
  if (scope === "LISTENING" && scoreBreakdown.listening) {
    return { score: scoreBreakdown.listening.projectedScaledScore, maxScore: 495 };
  }
  if (scope === "READING" && scoreBreakdown.reading) {
    return { score: scoreBreakdown.reading.projectedScaledScore, maxScore: 495 };
  }
  if (scope === "EXAM" && scoreBreakdown.totalProjectedScore != null) {
    return { score: scoreBreakdown.totalProjectedScore, maxScore: 990 };
  }
  return null;
}

async function updateBoardEntry(
  attempt: PracticeLeaderboardAttempt,
  period: PracticeLeaderboardPeriod,
): Promise<void> {
  const boardId = boardIdFor(attempt.scope, period);
  const entryRef = adminDb
    .collection("leaderboards")
    .doc(boardId)
    .collection("entries")
    .doc(attempt.uid);
  const bestRef = adminDb
    .collection("users")
    .doc(attempt.uid)
    .collection("leaderboardBest")
    .doc(period === "WEEKLY" ? `${attempt.scope}_${currentWeekKey()}` : attempt.scope);

  await adminDb.runTransaction(async (tx) => {
    const current = await tx.get(entryRef);
    const currentEntry = current.exists
      ? toComparable(current.data() ?? {}, attempt.uid)
      : null;
    if (currentEntry && compareComparable(attempt, currentEntry) >= 0) {
      return;
    }

    const payload = {
      uid: attempt.uid,
      email: maskEmail(attempt.email),
      displayName: attempt.displayName,
      avatarUrl: attempt.avatarUrl ?? null,
      score: attempt.leaderboardScore,
      maxScore: attempt.leaderboardMaxScore,
      correctCount: attempt.rawCorrect,
      questionCount: attempt.rawTotal,
      unansweredCount: attempt.unansweredCount,
      elapsedMillis: attempt.elapsedMillis,
      attemptId: attempt.attemptId,
      testId: attempt.testId,
      title: attempt.title,
      scope: attempt.scope,
      period,
      boardId,
      weekKey: period === "WEEKLY" ? currentWeekKey() : null,
      updatedAtMillis: attempt.submittedAtMillis,
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(entryRef, payload, { merge: true });
    tx.set(bestRef, {
      scope: attempt.scope,
      period,
      bestScore: attempt.leaderboardScore,
      bestAttemptId: attempt.attemptId,
      bestTestId: attempt.testId,
      correctCount: attempt.rawCorrect,
      questionCount: attempt.rawTotal,
      unansweredCount: attempt.unansweredCount,
      elapsedMillis: attempt.elapsedMillis,
      updatedAtMillis: attempt.submittedAtMillis,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

function boardIdFor(scope: PracticeLeaderboardScope, period: PracticeLeaderboardPeriod): string {
  const prefix = scope.toLowerCase();
  if (period === "WEEKLY") return `${prefix}_weekly_${currentWeekKey()}`;
  return `${prefix}_all_time`;
}

function boardEntryRef(
  uid: string,
  scope: PracticeLeaderboardScope,
  period: PracticeLeaderboardPeriod,
) {
  const boardId = boardIdFor(scope, period);
  return adminDb
    .collection("leaderboards")
    .doc(boardId)
    .collection("entries")
    .doc(uid);
}

function skillBoardPayload(
  input: SkillQuestionLeaderboardInput,
  scope: PracticeLeaderboardScope,
  points: number,
  period: PracticeLeaderboardPeriod,
  userData: Record<string, unknown>,
  data: Record<string, unknown>,
  weekKey?: string,
) {
  const boardId = period === "WEEKLY" && weekKey ? `${scope.toLowerCase()}_weekly_${weekKey}` : boardIdFor(scope, period);
  const currentScore = numberValue(data.score) ?? 0;
  const currentCorrect = numberValue(data.correctCount) ?? 0;
  const currentTotal = numberValue(data.questionCount) ?? 0;
  return {
    uid: input.uid,
    email: maskEmail(stringValue(userData.email)),
    displayName: stringValue(userData.displayName),
    avatarUrl: stringValue(userData.avatarUrl),
    score: currentScore + points,
    maxScore: 0,
    correctCount: currentCorrect + 1,
    questionCount: currentTotal + 1,
    unansweredCount: numberValue(data.unansweredCount) ?? 0,
    elapsedMillis: input.elapsedMillis ?? numberValue(data.elapsedMillis) ?? 0,
    attemptId: input.occurredAtMillis,
    testId: input.part,
    title: scope === "LISTENING" ? "Luyện nghe" : "Luyện đọc",
    scope,
    period,
    boardId,
    weekKey: period === "WEEKLY" ? weekKey ?? currentWeekKey() : null,
    updatedAtMillis: input.occurredAtMillis,
    updatedAt: FieldValue.serverTimestamp(),
    lastQuestionId: input.questionId,
    lastItemId: input.itemId,
    lastPart: input.part,
    lastLevel: input.level,
  };
}

function skillQuestionAwardId(module: "listening" | "reading", questionId: string): string {
  return encodeURIComponent(`${module}:${questionId}`);
}

function currentWeekKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "1");
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - dayOfWeek);
  const weekYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((localDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

function sameParts(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  return right.every((part, index) => left[index] === part);
}

function compareEntries(a: PracticeLeaderboardEntry, b: PracticeLeaderboardEntry): number {
  return (
    b.score - a.score ||
    b.correctCount - a.correctCount ||
    a.unansweredCount - b.unansweredCount ||
    a.elapsedMillis - b.elapsedMillis ||
    (a.updatedAtMillis ?? 0) - (b.updatedAtMillis ?? 0)
  );
}

function compareComparable(
  next: Pick<PracticeLeaderboardAttempt, "leaderboardScore" | "rawCorrect" | "unansweredCount" | "elapsedMillis" | "submittedAtMillis">,
  current: {
    score: number;
    correctCount: number;
    unansweredCount: number;
    elapsedMillis: number;
    updatedAtMillis: number;
  },
): number {
  return (
    current.score - next.leaderboardScore ||
    current.correctCount - next.rawCorrect ||
    next.unansweredCount - current.unansweredCount ||
    next.elapsedMillis - current.elapsedMillis ||
    next.submittedAtMillis - current.updatedAtMillis
  );
}

function toComparable(data: Record<string, unknown>, uid: string) {
  return {
    uid,
    score: numberValue(data.score) ?? 0,
    correctCount: numberValue(data.correctCount) ?? 0,
    unansweredCount: numberValue(data.unansweredCount) ?? 0,
    elapsedMillis: numberValue(data.elapsedMillis) ?? Number.MAX_SAFE_INTEGER,
    updatedAtMillis: numberValue(data.updatedAtMillis) ?? Number.MAX_SAFE_INTEGER,
  };
}

function toLeaderboardEntry(
  doc: FirebaseFirestore.DocumentSnapshot,
  scope: PracticeLeaderboardScope,
  period: PracticeLeaderboardPeriod,
): PracticeLeaderboardEntry {
  const data = doc.data() ?? {};
  return {
    rank: 0,
    uid: stringValue(data.uid) ?? doc.id,
    displayName: stringValue(data.displayName),
    email: stringValue(data.email),
    avatarUrl: stringValue(data.avatarUrl),
    score: numberValue(data.score) ?? 0,
    maxScore: numberValue(data.maxScore) ?? (scope === "EXAM" ? 990 : 495),
    correctCount: numberValue(data.correctCount) ?? 0,
    questionCount: numberValue(data.questionCount) ?? 0,
    unansweredCount: numberValue(data.unansweredCount) ?? 0,
    elapsedMillis: numberValue(data.elapsedMillis) ?? 0,
    attemptId: numberValue(data.attemptId) ?? 0,
    testId: numberValue(data.testId) ?? 0,
    title: stringValue(data.title),
    scope,
    period,
    updatedAtMillis: numberValue(data.updatedAtMillis),
  };
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email?.includes("@")) return email ?? null;
  const [name, domain] = email.split("@");
  if (!name || !domain) return null;
  return `${name.slice(0, 2)}***@${domain}`;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}
