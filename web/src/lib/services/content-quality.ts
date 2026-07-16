import { adminDb } from "@/lib/firestore/db";
import { BadRequest, NotFound } from "@/lib/api/response";
import { enforceDailyActionLimit } from "./rate-limit";

export interface ContentQualityAnswerInput {
  questionId: number;
  part: number;
  weakTag: string;
  correct: boolean;
}

export interface ContentQualityAttemptInput {
  testId: number;
  submittedAtMillis: number;
  elapsedMillis: number;
  answers: ContentQualityAnswerInput[];
}

export interface ContentQualitySummary {
  attempts: number;
  questions: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
  averageSecondsPerQuestion: number | null;
  reports: number;
}

export interface ContentQualityQuestion {
  id: string;
  testId: number;
  questionId: number;
  part: number;
  weakTag: string;
  attempts: number;
  correct: number;
  wrong: number;
  accuracy: number;
  averageSeconds: number;
  reports: number;
  riskScore: number;
  lastAttemptAtMillis: number;
}

export interface ContentQualityDashboard {
  summary: ContentQualitySummary;
  highRiskQuestions: ContentQualityQuestion[];
  reportedQuestions: ContentQualityQuestion[];
}

const SUMMARY_REF = ["contentQualitySummary", "current"] as const;

/**
 * Maintains aggregate-only admin analytics while an attempt is submitted.
 * It stores no learner identifiers or answer text in the quality collections.
 */
export async function recordContentQualityAttempt(input: ContentQualityAttemptInput): Promise<void> {
  const answers = uniqueAnswers(input.answers);
  if (answers.length === 0) return;
  const summaryRef = adminDb.collection(SUMMARY_REF[0]).doc(SUMMARY_REF[1]);
  const qualityRefs = answers.map((answer) => adminDb.collection("contentQuestionQuality").doc(questionQualityId(input.testId, answer.questionId)));

  await adminDb.runTransaction(async (transaction) => {
    const snapshots = await Promise.all([
      transaction.get(summaryRef),
      ...qualityRefs.map((ref) => transaction.get(ref)),
    ]);
    const summary = recordValue(snapshots[0].data());
    const secondsPerQuestion = Math.max(0, input.elapsedMillis / answers.length / 1_000);
    const currentQuestions = numberValue(summary.questions) ?? 0;
    const currentCorrect = numberValue(summary.correct) ?? 0;
    const currentWrong = numberValue(summary.wrong) ?? 0;
    const currentElapsed = numberValue(summary.totalElapsedMillis) ?? 0;
    const correctInAttempt = answers.filter((answer) => answer.correct).length;
    const wrongInAttempt = answers.length - correctInAttempt;

    transaction.set(summaryRef, {
      attempts: (numberValue(summary.attempts) ?? 0) + 1,
      questions: currentQuestions + answers.length,
      correct: currentCorrect + correctInAttempt,
      wrong: currentWrong + wrongInAttempt,
      totalElapsedMillis: currentElapsed + Math.max(0, input.elapsedMillis),
      reports: numberValue(summary.reports) ?? 0,
      updatedAtMillis: input.submittedAtMillis,
    }, { merge: true });

    answers.forEach((answer, index) => {
      const existing = recordValue(snapshots[index + 1].data());
      const attempts = (numberValue(existing.attempts) ?? 0) + 1;
      const correct = (numberValue(existing.correct) ?? 0) + (answer.correct ? 1 : 0);
      const wrong = (numberValue(existing.wrong) ?? 0) + (answer.correct ? 0 : 1);
      const reports = numberValue(existing.reports) ?? 0;
      transaction.set(qualityRefs[index], {
        testId: input.testId,
        questionId: answer.questionId,
        part: answer.part,
        weakTag: answer.weakTag,
        attempts,
        correct,
        wrong,
        reports,
        accuracy: percent(correct, attempts),
        averageSeconds: round2(((numberValue(existing.averageSeconds) ?? 0) * (attempts - 1) + secondsPerQuestion) / attempts),
        riskScore: qualityRiskScore(wrong, attempts, reports),
        lastAttemptAtMillis: input.submittedAtMillis,
        updatedAtMillis: input.submittedAtMillis,
      }, { merge: true });
    });
  });
}

export async function reportContentQuestion(
  uid: string,
  input: { attemptId: number; questionId: number; reason?: string | null },
): Promise<{ created: boolean }> {
  if (!Number.isInteger(input.attemptId) || !Number.isInteger(input.questionId)) {
    throw BadRequest("Invalid question report");
  }
  await enforceDailyActionLimit(uid, "content-report", 30);
  const attemptRef = adminDb.collection("users").doc(uid).collection("practiceAttempts").doc(String(input.attemptId));
  const attempt = await attemptRef.get();
  if (!attempt.exists) throw NotFound("Practice attempt not found");

  const answer = arrayValue(attempt.get("answers"))
    .map(recordValue)
    .find((item) => numberValue(item.questionId) === input.questionId);
  if (!answer) throw BadRequest("Question does not belong to this attempt");
  const testId = numberValue(attempt.get("testId"));
  if (testId == null) throw BadRequest("Practice attempt has no test id");

  const qualityRef = adminDb.collection("contentQuestionQuality").doc(questionQualityId(testId, input.questionId));
  const summaryRef = adminDb.collection(SUMMARY_REF[0]).doc(SUMMARY_REF[1]);
  const reportRef = adminDb.collection("contentQuestionReports").doc(`${uid}_${input.attemptId}_${input.questionId}`);
  const now = Date.now();
  const reason = cleanReason(input.reason);
  const created = await adminDb.runTransaction(async (transaction) => {
    const [existingReport, quality, summary] = await Promise.all([
      transaction.get(reportRef),
      transaction.get(qualityRef),
      transaction.get(summaryRef),
    ]);
    if (existingReport.exists) return false;

    const qualityData = recordValue(quality.data());
    const reports = (numberValue(qualityData.reports) ?? 0) + 1;
    const attempts = numberValue(qualityData.attempts) ?? 0;
    const wrong = numberValue(qualityData.wrong) ?? 0;
    const summaryData = recordValue(summary.data());
    transaction.set(reportRef, {
      uid,
      attemptId: input.attemptId,
      testId,
      questionId: input.questionId,
      part: numberValue(answer.part) ?? 0,
      weakTag: stringValue(answer.weakTag) ?? "general",
      reason,
      status: "OPEN",
      createdAtMillis: now,
    });
    transaction.set(qualityRef, {
      testId,
      questionId: input.questionId,
      part: numberValue(answer.part) ?? 0,
      weakTag: stringValue(answer.weakTag) ?? "general",
      reports,
      riskScore: qualityRiskScore(wrong, attempts, reports),
      lastReportedAtMillis: now,
      updatedAtMillis: now,
    }, { merge: true });
    transaction.set(summaryRef, {
      reports: (numberValue(summaryData.reports) ?? 0) + 1,
      updatedAtMillis: now,
    }, { merge: true });
    return true;
  });
  return { created };
}

export async function getContentQualityDashboard(): Promise<ContentQualityDashboard> {
  const [summary, riskSnapshot, reportsSnapshot] = await Promise.all([
    adminDb.collection(SUMMARY_REF[0]).doc(SUMMARY_REF[1]).get(),
    adminDb.collection("contentQuestionQuality").orderBy("riskScore", "desc").limit(50).get(),
    adminDb.collection("contentQuestionQuality").orderBy("reports", "desc").limit(50).get(),
  ]);
  const summaryData = recordValue(summary.data());
  const totalQuestions = numberValue(summaryData.questions) ?? 0;
  const totalCorrect = numberValue(summaryData.correct) ?? 0;
  const elapsedMillis = numberValue(summaryData.totalElapsedMillis) ?? 0;

  return {
    summary: {
      attempts: numberValue(summaryData.attempts) ?? 0,
      questions: totalQuestions,
      correct: totalCorrect,
      wrong: numberValue(summaryData.wrong) ?? 0,
      accuracy: totalQuestions > 0 ? percent(totalCorrect, totalQuestions) : null,
      averageSecondsPerQuestion: totalQuestions > 0 ? round2(elapsedMillis / totalQuestions / 1_000) : null,
      reports: numberValue(summaryData.reports) ?? 0,
    },
    highRiskQuestions: riskSnapshot.docs.map((doc) => toQualityQuestion(doc.id, doc.data())).filter((item): item is ContentQualityQuestion => item != null).filter((item) => item.attempts >= 3).slice(0, 12),
    reportedQuestions: reportsSnapshot.docs.map((doc) => toQualityQuestion(doc.id, doc.data())).filter((item): item is ContentQualityQuestion => item != null).filter((item) => item.reports > 0).slice(0, 12),
  };
}

/** A weighted risk score prevents one failed attempt from outranking established signals. */
export function qualityRiskScore(wrong: number, attempts: number, reports = 0): number {
  if (attempts <= 0) return reports * 1_000;
  const evidenceWeight = Math.min(1, attempts / 5);
  return Math.round((wrong / attempts) * evidenceWeight * 10_000 + reports * 1_000);
}

export function questionQualityId(testId: number, questionId: number): string {
  return `${testId}_${questionId}`;
}

function toQualityQuestion(id: string, value: Record<string, unknown>): ContentQualityQuestion | null {
  const attempts = numberValue(value.attempts) ?? 0;
  const testId = numberValue(value.testId);
  const questionId = numberValue(value.questionId);
  if (testId == null || questionId == null) return null;
  const correct = numberValue(value.correct) ?? 0;
  return {
    id,
    testId,
    questionId,
    part: numberValue(value.part) ?? 0,
    weakTag: stringValue(value.weakTag) ?? "general",
    attempts,
    correct,
    wrong: numberValue(value.wrong) ?? Math.max(0, attempts - correct),
    accuracy: numberValue(value.accuracy) ?? (attempts > 0 ? percent(correct, attempts) : 0),
    averageSeconds: numberValue(value.averageSeconds) ?? 0,
    reports: numberValue(value.reports) ?? 0,
    riskScore: numberValue(value.riskScore) ?? 0,
    lastAttemptAtMillis: numberValue(value.lastAttemptAtMillis) ?? 0,
  };
}

function uniqueAnswers(answers: ContentQualityAnswerInput[]): ContentQualityAnswerInput[] {
  const unique = new Map<number, ContentQualityAnswerInput>();
  for (const answer of answers) {
    if (Number.isInteger(answer.questionId) && answer.questionId > 0) unique.set(answer.questionId, answer);
  }
  return [...unique.values()];
}

function cleanReason(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim().slice(0, 500);
  return cleaned || null;
}

function percent(correct: number, total: number): number {
  return Math.round((correct * 10000) / total) / 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
