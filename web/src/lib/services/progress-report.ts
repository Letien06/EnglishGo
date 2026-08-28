import { adminDb } from "@/lib/firestore/db";
import { readServerCache } from "@/lib/server-cache";
import { progressReportCacheTag } from "./learner-cache";

export interface ProgressAttemptInput {
  attemptId: number;
  submittedAtMillis: number;
  correctCount: number;
  questionCount: number;
  partBreakdown: Array<{
    part: number;
    skill: "LISTENING" | "READING";
    correct: number;
    total: number;
  }>;
  scoreBreakdown: {
    totalProjectedScore: number | null;
    listening: { projectedScaledScore: number } | null;
    reading: { projectedScaledScore: number } | null;
  };
}

export interface ProgressTrendPoint {
  attemptId: number;
  submittedAtMillis: number;
  accuracy: number;
  estimatedToeicScore: number | null;
}

export interface ProgressSkillSummary {
  skill: "LISTENING" | "READING";
  correct: number;
  total: number;
  accuracy: number | null;
  latestEstimatedScore: number | null;
}

export interface ProgressPartSummary {
  part: number;
  skill: "LISTENING" | "READING";
  correct: number;
  total: number;
  accuracy: number;
}

export interface ScoreForecast {
  available: boolean;
  currentScore: number | null;
  predictedScore: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  sampleSize: number;
  confidence: "EARLY" | "REFERENCE" | "MODERATE";
}

export interface ProgressReportView {
  totalAttempts: number;
  totalQuestions: number;
  overallAccuracy: number | null;
  trend: ProgressTrendPoint[];
  listening: ProgressSkillSummary;
  reading: ProgressSkillSummary;
  parts: ProgressPartSummary[];
  strongestParts: ProgressPartSummary[];
  weakestParts: ProgressPartSummary[];
  forecast: ScoreForecast;
}

const RECENT_ATTEMPT_LIMIT = 60;
const TOEIC_MIN_SCORE = 10;
const TOEIC_MAX_SCORE = 990;

/**
 * Produces a learner-facing report from the user's own, server-scored attempts.
 * It deliberately never turns partial practice into a full TOEIC score forecast.
 */
export async function getProgressReport(uid: string): Promise<ProgressReportView> {
  return cachedProgressReport(uid);
}

async function readProgressReport(uid: string): Promise<ProgressReportView> {
  const snapshot = await adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceAttempts")
    .orderBy("submittedAtMillis", "desc")
    .limit(RECENT_ATTEMPT_LIMIT)
    .get();

  return buildProgressReport(
    snapshot.docs
      .map((doc) => toProgressAttempt(doc.data(), doc.id))
      .filter((attempt): attempt is ProgressAttemptInput => attempt != null),
  );
}

function cachedProgressReport(uid: string): Promise<ProgressReportView> {
  return readServerCache(
    () => readProgressReport(uid),
    ["learner-progress-report", uid],
    { revalidate: 120, tags: [progressReportCacheTag(uid)] },
  );
}

export function buildProgressReport(attempts: ProgressAttemptInput[]): ProgressReportView {
  const ordered = [...attempts]
    .filter((attempt) => attempt.submittedAtMillis > 0 && attempt.questionCount > 0)
    .sort((a, b) => a.submittedAtMillis - b.submittedAtMillis);

  const totalQuestions = ordered.reduce((sum, attempt) => sum + attempt.questionCount, 0);
  const totalCorrect = ordered.reduce((sum, attempt) => sum + attempt.correctCount, 0);
  const trend = ordered.slice(-20).map((attempt) => ({
    attemptId: attempt.attemptId,
    submittedAtMillis: attempt.submittedAtMillis,
    accuracy: percent(attempt.correctCount, attempt.questionCount),
    estimatedToeicScore: attempt.scoreBreakdown.totalProjectedScore,
  }));

  const parts = buildPartSummaries(ordered);
  const rankedParts = [...parts].sort((a, b) => b.accuracy - a.accuracy || b.total - a.total);
  const weakestParts = [...parts].sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);

  return {
    totalAttempts: ordered.length,
    totalQuestions,
    overallAccuracy: totalQuestions > 0 ? percent(totalCorrect, totalQuestions) : null,
    trend,
    listening: buildSkillSummary("LISTENING", ordered),
    reading: buildSkillSummary("READING", ordered),
    parts,
    strongestParts: rankedParts.slice(0, 2),
    weakestParts: weakestParts.slice(0, 2),
    forecast: buildForecast(ordered),
  };
}

function buildPartSummaries(attempts: ProgressAttemptInput[]): ProgressPartSummary[] {
  const totals = new Map<number, { skill: "LISTENING" | "READING"; correct: number; total: number }>();
  for (const attempt of attempts) {
    for (const part of attempt.partBreakdown) {
      if (part.total <= 0) continue;
      const current = totals.get(part.part) ?? { skill: part.skill, correct: 0, total: 0 };
      current.correct += part.correct;
      current.total += part.total;
      totals.set(part.part, current);
    }
  }
  return [...totals.entries()]
    .map(([part, value]) => ({
      part,
      skill: value.skill,
      correct: value.correct,
      total: value.total,
      accuracy: percent(value.correct, value.total),
    }))
    .sort((a, b) => a.part - b.part);
}

function buildSkillSummary(
  skill: "LISTENING" | "READING",
  attempts: ProgressAttemptInput[],
): ProgressSkillSummary {
  let correct = 0;
  let total = 0;
  let latestEstimatedScore: number | null = null;

  for (const attempt of attempts) {
    for (const part of attempt.partBreakdown) {
      if (part.skill !== skill) continue;
      correct += part.correct;
      total += part.total;
    }
    const estimate = skill === "LISTENING"
      ? attempt.scoreBreakdown.listening?.projectedScaledScore
      : attempt.scoreBreakdown.reading?.projectedScaledScore;
    if (estimate != null) latestEstimatedScore = estimate;
  }

  return {
    skill,
    correct,
    total,
    accuracy: total > 0 ? percent(correct, total) : null,
    latestEstimatedScore,
  };
}

function buildForecast(attempts: ProgressAttemptInput[]): ScoreForecast {
  const fullScorePoints = attempts
    .filter((attempt) => attempt.scoreBreakdown.totalProjectedScore != null)
    .slice(-8)
    .map((attempt) => ({
      submittedAtMillis: attempt.submittedAtMillis,
      score: attempt.scoreBreakdown.totalProjectedScore as number,
    }));
  const currentScore = fullScorePoints.at(-1)?.score ?? null;

  if (fullScorePoints.length < 3 || currentScore == null) {
    return {
      available: false,
      currentScore,
      predictedScore: null,
      lowerBound: null,
      upperBound: null,
      sampleSize: fullScorePoints.length,
      confidence: "EARLY",
    };
  }

  const firstAt = fullScorePoints[0].submittedAtMillis;
  const coordinates = fullScorePoints.map((point) => ({
    x: Math.max(0, (point.submittedAtMillis - firstAt) / 86_400_000),
    y: point.score,
  }));
  const slopePerDay = linearRegressionSlope(coordinates);
  // A forecast should not promise dramatic gains from a very small data set.
  const expectedDelta = clamp(Math.round(slopePerDay * 28), -50, 100);
  const predictedScore = clampToeic(currentScore + expectedDelta);
  const range = fullScorePoints.length >= 5 ? 35 : 55;

  return {
    available: true,
    currentScore,
    predictedScore,
    lowerBound: clampToeic(predictedScore - range),
    upperBound: clampToeic(predictedScore + range),
    sampleSize: fullScorePoints.length,
    confidence: fullScorePoints.length >= 5 ? "MODERATE" : "REFERENCE",
  };
}

function linearRegressionSlope(points: Array<{ x: number; y: number }>): number {
  const averageX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const averageY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point.x - averageX) ** 2, 0);
  if (denominator <= 0) return 0;
  const numerator = points.reduce(
    (sum, point) => sum + (point.x - averageX) * (point.y - averageY),
    0,
  );
  return numerator / denominator;
}

function toProgressAttempt(value: Record<string, unknown>, id: string): ProgressAttemptInput | null {
  const questionCount = numberValue(value.questionCount);
  const submittedAtMillis = numberValue(value.submittedAtMillis);
  if (!questionCount || !submittedAtMillis) return null;
  const scoreBreakdown = recordValue(value.scoreBreakdown);
  const listening = toSkillScore(scoreBreakdown.listening);
  const reading = toSkillScore(scoreBreakdown.reading);
  return {
    attemptId: numberValue(value.attemptId) ?? Number(id),
    submittedAtMillis,
    correctCount: numberValue(value.correctCount) ?? 0,
    questionCount,
    partBreakdown: arrayValue(value.partBreakdown).map(toPart).filter((part): part is NonNullable<typeof part> => part != null),
    scoreBreakdown: {
      totalProjectedScore: numberValue(scoreBreakdown.totalProjectedScore),
      listening,
      reading,
    },
  };
}

function toPart(value: unknown): ProgressAttemptInput["partBreakdown"][number] | null {
  const data = recordValue(value);
  const part = numberValue(data.part);
  const total = numberValue(data.total);
  if (!part || !total) return null;
  return {
    part,
    skill: data.skill === "READING" ? "READING" : "LISTENING",
    correct: numberValue(data.correct) ?? 0,
    total,
  };
}

function toSkillScore(value: unknown): { projectedScaledScore: number } | null {
  const score = numberValue(recordValue(value).projectedScaledScore);
  return score == null ? null : { projectedScaledScore: score };
}

function percent(correct: number, total: number): number {
  return Math.round((correct * 10000) / total) / 100;
}

function clampToeic(value: number): number {
  return Math.round(clamp(value, TOEIC_MIN_SCORE, TOEIC_MAX_SCORE) / 5) * 5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
