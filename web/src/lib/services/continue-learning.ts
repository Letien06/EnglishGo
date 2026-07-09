import { adminDb } from "@/lib/firestore/db";
import type { AppUser } from "@/types";
import { dueWords } from "./vocab";

export interface ContinuePracticeDraft {
  testId: number;
  title: string;
  href: string;
  mode: string;
  parts: number[];
  answeredCount: number;
  currentQuestionIndex: number;
  updatedAtMillis: number;
}

export interface ContinueRecommendation {
  label: string;
  href: string;
  reason: string;
}

export interface ContinueVocabHistory {
  id: string;
  title: string;
  mode: string;
  accuracy: number;
  score: number;
  finishedAtMillis: number;
}

export interface ContinueLearningView {
  dueVocabWords: number;
  nextPracticeRecommendation: ContinueRecommendation | null;
  practiceDrafts: ContinuePracticeDraft[];
  recentVocabHistory: ContinueVocabHistory[];
}

export async function getContinueLearning(user: AppUser): Promise<ContinueLearningView> {
  const uid = user.uid;
  const [profileSnap, drafts, history, dueVocab] = await Promise.all([
    adminDb.collection("users").doc(uid).get().catch(() => null),
    recentPracticeDrafts(uid),
    recentVocabHistory(uid),
    dueWords(uid).catch(() => 0),
  ]);
  const profile = profileSnap?.exists ? profileSnap.data() ?? {} : {};
  return {
    dueVocabWords: dueVocab,
    nextPracticeRecommendation: toRecommendation(profile.nextPracticeRecommendation),
    practiceDrafts: drafts,
    recentVocabHistory: history,
  };
}

async function recentPracticeDrafts(uid: string): Promise<ContinuePracticeDraft[]> {
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceDrafts")
    .orderBy("updatedAtMillis", "desc")
    .limit(5)
    .get()
    .catch(() => null);
  if (!snap) return [];
  return snap.docs.map((doc) => {
    const parts = arrayValue(doc.get("parts"))
      .map(numberValue)
      .filter((part): part is number => part != null && part >= 1 && part <= 7);
    const testId = numberValue(doc.get("testId")) ?? 0;
    const mode = stringValue(doc.get("mode")) ?? "exam";
    const durationMinutes = numberValue(doc.get("durationMinutes")) ?? 120;
    const payload = parsePayload(stringValue(doc.get("payload")));
    const answeredCount = Object.values(recordValue(payload.answers)).filter((answer) => {
      const item = recordValue(answer);
      return numberValue(item.selectedOptionId) != null || Boolean(stringValue(item.textResponse));
    }).length;
    const params = new URLSearchParams({
      mode,
      parts: parts.join(","),
      time: String(durationMinutes),
    });
    return {
      testId,
      title: stringValue(doc.get("title")) ?? `Practice test ${testId}`,
      href: `/practice/session/${testId}?${params.toString()}`,
      mode,
      parts,
      answeredCount,
      currentQuestionIndex: numberValue(doc.get("currentQuestionIndex")) ?? 0,
      updatedAtMillis: numberValue(doc.get("updatedAtMillis")) ?? 0,
    };
  });
}

async function recentVocabHistory(uid: string): Promise<ContinueVocabHistory[]> {
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("vocabStudyHistory")
    .orderBy("finishedAtMillis", "desc")
    .limit(5)
    .get()
    .catch(() => null);
  if (!snap) return [];
  return snap.docs.map((doc) => ({
    id: doc.id,
    title: stringValue(doc.get("title")) ?? "Vocabulary session",
    mode: stringValue(doc.get("mode")) ?? "Vocab",
    accuracy: numberValue(doc.get("accuracy")) ?? 0,
    score: numberValue(doc.get("score")) ?? 0,
    finishedAtMillis: numberValue(doc.get("finishedAtMillis")) ?? 0,
  }));
}

function toRecommendation(value: unknown): ContinueRecommendation | null {
  const data = recordValue(value);
  const label = stringValue(data.label);
  const href = stringValue(data.href);
  const reason = stringValue(data.reason);
  if (!label || !href || !reason) return null;
  return { label, href, reason };
}

function parsePayload(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return {};
  }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
