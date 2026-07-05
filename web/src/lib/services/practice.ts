import { adminDb } from "@/lib/firestore/db";
import { BadRequest, NotFound } from "@/lib/api/response";
import { FieldPath } from "firebase-admin/firestore";
import type { AppUser } from "@/types";
import type { DauToeicQuestion, DauToeicTest } from "@/types/dautoeic";
import * as dautoeic from "./dautoeic";
import { addScore } from "./community";
import {
  hasTestIndex,
  queryTestIndex,
  writeTestIndex,
} from "./dautoeic-test-index";

export interface PracticeTestCard {
  id: number;
  externalId: string;
  title: string;
  type: string;
  difficulty: string | null;
  duration: number;
  totalQuestions: number;
}

export type PracticeMode = "exam" | "part";

export interface PracticeSessionConfig {
  mode: PracticeMode;
  parts: number[];
  durationMinutes: number;
  sessionKey: string;
}

export interface PracticeSessionInput {
  mode?: string | null;
  parts?: string | number[] | null;
  durationMinutes?: number | string | null;
  resetDraft?: boolean | string | null;
}

export interface PracticeOption {
  id: number;
  content: string;
  correct: boolean;
}

export interface PracticeQuestion {
  id: number;
  part: number;
  skillType: "LISTENING" | "READING";
  type: "MULTIPLE_CHOICE";
  content: string;
  audioUrl: string | null;
  imageUrl: string | null;
  explanation: string | null;
  group: {
    id: number;
    title: string;
    passageText: string;
  } | null;
}

export interface PracticeSessionView {
  test: PracticeTestCard;
  config: PracticeSessionConfig;
  questions: PracticeQuestion[];
  optionsByQuestionId: Record<string, PracticeOption[]>;
  draftPayload: string;
  startedAtMillis: number;
  serverNowMillis: number;
  expiresAtMillis: number;
}

export interface PracticeAnswerRequest {
  questionId: number;
  selectedOptionId?: number | null;
  textResponse?: string | null;
}

export interface PracticeSubmissionResponse {
  attemptId: number;
  score: number;
  correctCount: number;
  questionCount: number;
  expired: boolean;
  elapsedMillis: number;
}

export interface PracticePartBreakdown {
  part: number;
  total: number;
  correct: number;
  percent: number;
}

export interface PracticeAttempt {
  attemptId: number;
  testId: number;
  title: string;
  type: string;
  difficulty: string | null;
  mode: PracticeMode;
  parts: number[];
  durationMinutes: number;
  score: number;
  correctCount: number;
  questionCount: number;
  expired: boolean;
  elapsedMillis: number;
  submittedAtMillis: number | null;
  partBreakdown: PracticePartBreakdown[];
}

export interface ReviewAnswer {
  questionId: number;
  part: number;
  questionText: string;
  explanation: string | null;
  selectedOptionId: number | null;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  correct: boolean;
  textResponse: string | null;
  options: PracticeOption[];
}

export interface AttemptReviewView {
  attempt: PracticeAttempt;
  answers: ReviewAnswer[];
}

interface PracticeContent {
  test: PracticeTestCard;
  questions: PracticeQuestion[];
  optionsByQuestionId: Record<string, PracticeOption[]>;
  correctAnswerByQuestionId: Record<string, string | null>;
}

interface PracticeDraftState {
  payload: string;
  startedAtMillis: number;
  updatedAtMillis: number;
}

export interface PracticeHistoryPage {
  items: PracticeAttempt[];
  total: number;
  size: number;
  nextCursor?: string;
}

const SUBMIT_GRACE_MILLIS = 30_000;
const ALL_PARTS = [1, 2, 3, 4, 5, 6, 7] as const;
const DEFAULT_FULL_TEST_MINUTES = 120;
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 180;
export const PART_DEFAULTS: Record<number, { questionCount: number; suggestedMinutes: number; skill: "LISTENING" | "READING" }> = {
  1: { questionCount: 6, suggestedMinutes: 4, skill: "LISTENING" },
  2: { questionCount: 25, suggestedMinutes: 15, skill: "LISTENING" },
  3: { questionCount: 39, suggestedMinutes: 25, skill: "LISTENING" },
  4: { questionCount: 30, suggestedMinutes: 20, skill: "LISTENING" },
  5: { questionCount: 30, suggestedMinutes: 18, skill: "READING" },
  6: { questionCount: 16, suggestedMinutes: 10, skill: "READING" },
  7: { questionCount: 54, suggestedMinutes: 42, skill: "READING" },
};

export async function findTests(
  type?: string | null,
  difficulty?: string | null,
  cursor?: string | null,
  size = 10,
): Promise<{ items: PracticeTestCard[]; total: number; size: number; nextCursor?: string }> {
  const safeSize = Math.min(Math.max(size, 1), 50);
  if (!(await hasTestIndex())) {
    await writeTestIndex(await dautoeic.listTests(null));
  }
  const page = await queryTestIndex({
    difficulty,
    search: type,
    cursor,
    size: safeSize,
  });
  return {
    items: page.tests.map(toTestCard),
    total: page.total,
    size: safeSize,
    nextCursor: page.nextCursor,
  };
}

export async function getPracticeSession(
  testId: number,
  uid: string,
  input?: PracticeSessionInput,
): Promise<PracticeSessionView> {
  const config = normalizeSessionConfig(input, testId);
  const content = await loadContent(testId, config.parts);
  if (content.questions.length === 0) {
    throw BadRequest("Selected test parts have no questions");
  }
  if (input?.resetDraft === true || input?.resetDraft === "1") {
    await practiceDraftRef(uid, config.sessionKey).delete();
  }
  const draft = await getOrCreateDraft(uid, testId, config);
  const serverNowMillis = Date.now();
  return {
    ...content,
    config,
    draftPayload: draft.payload,
    startedAtMillis: draft.startedAtMillis,
    serverNowMillis,
    expiresAtMillis: draft.startedAtMillis + config.durationMinutes * 60_000,
  };
}

export async function saveDraft(
  uid: string,
  testId: number,
  payload: string | null,
  input?: PracticeSessionInput,
): Promise<{ id: number; payload: string; updatedAtMillis: number }> {
  const config = normalizeSessionConfig(input, testId);
  const safePayload = payload || "{}";
  const updatedAtMillis = Date.now();
  const draftRef = practiceDraftRef(uid, config.sessionKey);
  const snap = await draftRef.get();
  const startedAtMillis =
    numberValue(snap.get("startedAtMillis")) ?? updatedAtMillis;
  await adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceDrafts")
    .doc(config.sessionKey)
    .set(
      {
        source: "DAUTOEIC",
        testId,
        mode: config.mode,
        parts: config.parts,
        durationMinutes: config.durationMinutes,
        sessionKey: config.sessionKey,
        payload: safePayload,
        startedAtMillis,
        updatedAtMillis,
      },
      { merge: true },
    );
  return { id: testId, payload: safePayload, updatedAtMillis };
}

export async function submit(
  user: AppUser,
  testId: number,
  answers: PracticeAnswerRequest[],
  input?: PracticeSessionInput,
): Promise<PracticeSubmissionResponse> {
  const config = normalizeSessionConfig(input, testId);
  const content = await loadContent(testId, config.parts);
  if (content.questions.length === 0) {
    throw BadRequest("Test has no questions");
  }
  const submittedAtMillis = Date.now();
  const draftSnap = await practiceDraftRef(user.uid, config.sessionKey).get();
  const startedAtMillis =
    numberValue(draftSnap.get("startedAtMillis")) ?? submittedAtMillis;
  const elapsedMillis = Math.max(submittedAtMillis - startedAtMillis, 0);
  const expired =
    elapsedMillis > config.durationMinutes * 60_000 + SUBMIT_GRACE_MILLIS;

  const answersByQuestionId = new Map(answers.map((a) => [a.questionId, a]));
  let correctCount = 0;
  const answerDocs: ReviewAnswer[] = [];
  const partStats = new Map<number, { total: number; correct: number }>();

  for (const question of content.questions) {
    const submitted =
      answersByQuestionId.get(question.id) ?? ({ questionId: question.id } satisfies PracticeAnswerRequest);
    const selectedAnswer = dautoeic.optionLetter(submitted.selectedOptionId);
    const correctAnswer = content.correctAnswerByQuestionId[String(question.id)] ?? null;
    const correct = Boolean(correctAnswer && correctAnswer === selectedAnswer);
    if (correct) correctCount++;
    const currentPartStats = partStats.get(question.part) ?? { total: 0, correct: 0 };
    currentPartStats.total += 1;
    if (correct) currentPartStats.correct += 1;
    partStats.set(question.part, currentPartStats);
    answerDocs.push({
      questionId: question.id,
      part: question.part,
      questionText: question.content,
      explanation: question.explanation,
      selectedOptionId: submitted.selectedOptionId ?? null,
      selectedAnswer,
      correctAnswer,
      correct,
      textResponse: submitted.textResponse ?? null,
      options: content.optionsByQuestionId[String(question.id)] ?? [],
    });
  }

  const score = round2((correctCount * 100) / content.questions.length);
  const partBreakdown = config.parts
    .map((part) => {
      const stat = partStats.get(part) ?? { total: 0, correct: 0 };
      return {
        part,
        total: stat.total,
        correct: stat.correct,
        percent: stat.total > 0 ? round2((stat.correct * 100) / stat.total) : 0,
      };
    })
    .filter((part) => part.total > 0);
  const attemptId = submittedAtMillis;
  const attempt = {
    source: "DAUTOEIC",
    attemptId,
    testId,
    title: content.test.title,
    type: content.test.type,
    difficulty: content.test.difficulty,
    mode: config.mode,
    parts: config.parts,
    durationMinutes: config.durationMinutes,
    sessionKey: config.sessionKey,
    score,
    correctCount,
    questionCount: content.questions.length,
    startedAtMillis,
    submittedAtMillis,
    elapsedMillis,
    expired,
    partBreakdown,
    answers: answerDocs,
  };
  await adminDb
    .collection("users")
    .doc(user.uid)
    .collection("practiceAttempts")
    .doc(String(attemptId))
    .set(attempt, { merge: true });
  await adminDb
    .collection("users")
    .doc(user.uid)
    .collection("practiceDrafts")
    .doc(config.sessionKey)
    .delete();
  await addScore(user, score);
  return {
    attemptId,
    score,
    correctCount,
    questionCount: content.questions.length,
    expired,
    elapsedMillis,
  };
}

export async function getAttemptReview(
  uid: string,
  attemptId: number,
): Promise<AttemptReviewView> {
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceAttempts")
    .doc(String(attemptId))
    .get();
  if (!snap.exists) throw NotFound("Attempt not found");
  const attempt = toAttempt(snap);
  const answers = arrayValue(snap.get("answers")).map(toReviewAnswer);
  return { attempt, answers };
}

export async function getHistory(
  uid: string,
  size = 10,
  cursor?: string | null,
): Promise<PracticeHistoryPage> {
  const safeSize = Math.min(Math.max(size, 1), 50);
  const baseQuery = adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceAttempts");
  let itemsQuery = baseQuery
    .orderBy("submittedAtMillis", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .limit(safeSize);

  if (cursor?.trim()) {
    const parsed = parseHistoryCursor(cursor);
    itemsQuery = itemsQuery.startAfter(parsed.submittedAtMillis, parsed.docId);
  }

  const [snap, totalSnap] = await Promise.all([
    itemsQuery.get(),
    baseQuery.count().get(),
  ]);
  const attempts = snap.docs.map(toAttempt);
  const lastDoc = snap.docs.at(-1);
  return {
    items: attempts,
    total: totalSnap.data().count,
    size: safeSize,
    nextCursor:
      snap.docs.length === safeSize && lastDoc
        ? makeHistoryCursor(
            numberValue(lastDoc.get("submittedAtMillis")) ?? Number(lastDoc.id),
            lastDoc.id,
          )
        : undefined,
  };
}

function practiceDraftRef(uid: string, sessionKey: string) {
  return adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceDrafts")
    .doc(sessionKey);
}

async function getOrCreateDraft(
  uid: string,
  testId: number,
  config: PracticeSessionConfig,
): Promise<PracticeDraftState> {
  const ref = practiceDraftRef(uid, config.sessionKey);
  const now = Date.now();
  const snap = await ref.get();
  if (snap.exists) {
    const startedAtMillis = numberValue(snap.get("startedAtMillis")) ?? now;
    const payload = stringValue(snap.get("payload")) ?? "{}";
    if (!numberValue(snap.get("startedAtMillis"))) {
      await ref.set({ startedAtMillis, updatedAtMillis: now }, { merge: true });
    }
    return {
      payload,
      startedAtMillis,
      updatedAtMillis: numberValue(snap.get("updatedAtMillis")) ?? now,
    };
  }

  const draft = {
    source: "DAUTOEIC",
    testId,
    mode: config.mode,
    parts: config.parts,
    durationMinutes: config.durationMinutes,
    sessionKey: config.sessionKey,
    payload: "{}",
    startedAtMillis: now,
    updatedAtMillis: now,
  };
  await ref.set(draft, { merge: true });
  return draft;
}

async function loadContent(routeTestId: number, parts: number[] = [...ALL_PARTS]): Promise<PracticeContent> {
  const externalTest = await resolveExternalTest(routeTestId);
  const test = toTestCard(externalTest);
  const questions: PracticeQuestion[] = [];
  const optionsByQuestionId: Record<string, PracticeOption[]> = {};
  const correctAnswerByQuestionId: Record<string, string | null> = {};

  for (const part of parts) {
    const partContent = await dautoeic.getPart(externalTest.id, part);
    for (const externalQuestion of partContent.questions) {
      const question = toQuestion(test, externalQuestion);
      questions.push(question);
      const options = toOptions(question, externalQuestion);
      optionsByQuestionId[String(question.id)] = options;
      correctAnswerByQuestionId[String(question.id)] = cleanAnswer(externalQuestion.correctAnswer);
    }
  }

  questions.sort((a, b) => a.part - b.part || a.id - b.id);
  return { test, questions, optionsByQuestionId, correctAnswerByQuestionId };
}

async function resolveExternalTest(routeId: number): Promise<DauToeicTest> {
  const tests = await dautoeic.listTests(null);
  const found = tests.find((test) => dautoeic.routeTestId(test.id) === routeId);
  if (!found) throw NotFound("Test not found");
  return found;
}

function toTestCard(test: DauToeicTest): PracticeTestCard {
  return {
    id: dautoeic.routeTestId(test.id),
    externalId: test.id,
    title: test.name || "Dau TOEIC test",
    type: test.setName || test.source || "DAUTOEIC",
    difficulty: test.difficultyLevel == null ? null : String(test.difficultyLevel),
    duration: 120,
    totalQuestions: test.totalQuestions ?? 200,
  };
}

function toQuestion(
  test: PracticeTestCard,
  externalQuestion: DauToeicQuestion,
): PracticeQuestion {
  const id = dautoeic.routeQuestionId(externalQuestion.id);
  return {
    id,
    part: externalQuestion.part ?? 1,
    skillType: (externalQuestion.part ?? 1) <= 4 ? "LISTENING" : "READING",
    type: "MULTIPLE_CHOICE",
    content: externalQuestion.questionText || `Question ${id}`,
    audioUrl: externalQuestion.audioUrl,
    imageUrl: externalQuestion.imageUrl,
    explanation: externalQuestion.explanationVi || externalQuestion.explanationEn,
    group: externalQuestion.passageText
      ? {
          id: dautoeic.routeQuestionId(externalQuestion.passageId || externalQuestion.id),
          title: `Part ${externalQuestion.part ?? ""}`.trim(),
          passageText: externalQuestion.passageText,
        }
      : null,
  };
}

function toOptions(
  question: PracticeQuestion,
  externalQuestion: DauToeicQuestion,
): PracticeOption[] {
  const correct = cleanAnswer(externalQuestion.correctAnswer);
  return [
    ["A", externalQuestion.optionA],
    ["B", externalQuestion.optionB],
    ["C", externalQuestion.optionC],
    ["D", externalQuestion.optionD],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([letter, content]) => ({
      id: dautoeic.optionId(question.id, letter),
      content: `${letter}. ${content}`,
      correct: letter === correct,
    }));
}

function toAttempt(doc: FirebaseFirestore.DocumentSnapshot): PracticeAttempt {
  const parts = arrayValue(doc.get("parts"))
    .map(numberValue)
    .filter((part): part is number => part != null && part >= 1 && part <= 7);
  return {
    attemptId: numberValue(doc.get("attemptId")) ?? Number(doc.id),
    testId: numberValue(doc.get("testId")) ?? 0,
    title: stringValue(doc.get("title")) ?? "Dau TOEIC test",
    type: stringValue(doc.get("type")) ?? "DAUTOEIC",
    difficulty: stringValue(doc.get("difficulty")),
    mode: normalizeAttemptMode(doc.get("mode")),
    parts: parts.length > 0 ? parts : [...ALL_PARTS],
    durationMinutes: numberValue(doc.get("durationMinutes")) ?? DEFAULT_FULL_TEST_MINUTES,
    score: numberValue(doc.get("score")) ?? 0,
    correctCount: numberValue(doc.get("correctCount")) ?? 0,
    questionCount: numberValue(doc.get("questionCount")) ?? 0,
    expired: Boolean(doc.get("expired")),
    elapsedMillis: numberValue(doc.get("elapsedMillis")) ?? 0,
    submittedAtMillis: numberValue(doc.get("submittedAtMillis")),
    partBreakdown: arrayValue(doc.get("partBreakdown")).map(toPartBreakdown),
  };
}

function toPartBreakdown(value: unknown): PracticePartBreakdown {
  const data = recordValue(value);
  const total = numberValue(data.total) ?? 0;
  const correct = numberValue(data.correct) ?? 0;
  return {
    part: numberValue(data.part) ?? 1,
    total,
    correct,
    percent: numberValue(data.percent) ?? (total > 0 ? round2((correct * 100) / total) : 0),
  };
}

function normalizeAttemptMode(value: unknown): PracticeMode {
  return value === "part" ? "part" : "exam";
}

export function normalizeSessionConfig(input?: PracticeSessionInput, testId?: number): PracticeSessionConfig {
  const parts = normalizeParts(input?.parts);
  const requestedMode = input?.mode === "part" || input?.mode === "practice" ? "part" : "exam";
  const mode: PracticeMode = parts.length === ALL_PARTS.length ? "exam" : requestedMode;
  const durationMinutes = normalizeDuration(input?.durationMinutes, parts);
  return {
    mode,
    parts,
    durationMinutes,
    sessionKey: makeSessionKey(mode, parts, durationMinutes, testId),
  };
}

function normalizeParts(value: PracticeSessionInput["parts"]): number[] {
  const rawParts = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const parsed = rawParts
    .map((part) => Number(part))
    .filter((part) => Number.isInteger(part) && part >= 1 && part <= 7);
  const unique = [...new Set(parsed)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [...ALL_PARTS];
}

function normalizeDuration(value: PracticeSessionInput["durationMinutes"], parts: number[]): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(parsed)));
  }
  return suggestedMinutes(parts);
}

export function suggestedMinutes(parts: number[]): number {
  const normalized = normalizeParts(parts);
  if (normalized.length === ALL_PARTS.length) return DEFAULT_FULL_TEST_MINUTES;
  return Math.min(
    MAX_DURATION_MINUTES,
    Math.max(
      MIN_DURATION_MINUTES,
      normalized.reduce((total, part) => total + (PART_DEFAULTS[part]?.suggestedMinutes ?? 0), 0),
    ),
  );
}

function makeSessionKey(mode: PracticeMode, parts: number[], durationMinutes: number, testId?: number): string {
  const testSegment = Number.isFinite(testId) ? String(testId) : "unknown";
  return `practice-${testSegment}-${mode}-parts-${parts.join("-")}-time-${durationMinutes}`;
}

function toReviewAnswer(value: unknown): ReviewAnswer {
  const data = recordValue(value);
  return {
    questionId: numberValue(data.questionId) ?? 0,
    part: numberValue(data.part) ?? 1,
    questionText: stringValue(data.questionText) ?? "Question",
    explanation: stringValue(data.explanation),
    selectedOptionId: numberValue(data.selectedOptionId),
    selectedAnswer: stringValue(data.selectedAnswer),
    correctAnswer: stringValue(data.correctAnswer),
    correct: Boolean(data.correct),
    textResponse: stringValue(data.textResponse),
    options: arrayValue(data.options).map((option) => {
      const optionData = recordValue(option);
      return {
        id: numberValue(optionData.id) ?? 0,
        content: stringValue(optionData.content) ?? "",
        correct: Boolean(optionData.correct),
      };
    }),
  };
}

function cleanAnswer(value: string | null): string | null {
  return value?.trim() ? value.trim().slice(0, 1).toUpperCase() : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function makeHistoryCursor(submittedAtMillis: number, docId: string): string {
  return Buffer.from(JSON.stringify({ submittedAtMillis, docId })).toString(
    "base64url",
  );
}

function parseHistoryCursor(cursor: string): {
  submittedAtMillis: number;
  docId: string;
} {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { submittedAtMillis?: unknown; docId?: unknown };
    const submittedAtMillis = numberValue(parsed.submittedAtMillis);
    const docId = stringValue(parsed.docId);
    if (!submittedAtMillis || !docId) throw new Error("Invalid cursor");
    return { submittedAtMillis, docId };
  } catch {
    throw BadRequest("Invalid history cursor");
  }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return value == null ? null : String(value);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
