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

export interface PracticeAttempt {
  attemptId: number;
  testId: number;
  title: string;
  type: string;
  difficulty: string | null;
  score: number;
  correctCount: number;
  questionCount: number;
  expired: boolean;
  submittedAtMillis: number | null;
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
): Promise<PracticeSessionView> {
  const content = await loadContent(testId);
  const draft = await getOrCreateDraft(uid, testId);
  const serverNowMillis = Date.now();
  return {
    ...content,
    draftPayload: draft.payload,
    startedAtMillis: draft.startedAtMillis,
    serverNowMillis,
    expiresAtMillis: draft.startedAtMillis + content.test.duration * 60_000,
  };
}

export async function saveDraft(
  uid: string,
  testId: number,
  payload: string | null,
): Promise<{ id: number; payload: string; updatedAtMillis: number }> {
  const safePayload = payload || "{}";
  const updatedAtMillis = Date.now();
  const draftRef = practiceDraftRef(uid, testId);
  const snap = await draftRef.get();
  const startedAtMillis =
    numberValue(snap.get("startedAtMillis")) ?? updatedAtMillis;
  await adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceDrafts")
    .doc(String(testId))
    .set(
      {
        source: "DAUTOEIC",
        testId,
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
): Promise<PracticeSubmissionResponse> {
  const content = await loadContent(testId);
  if (content.questions.length === 0) {
    throw BadRequest("Test has no questions");
  }
  const submittedAtMillis = Date.now();
  const draftSnap = await practiceDraftRef(user.uid, testId).get();
  const startedAtMillis =
    numberValue(draftSnap.get("startedAtMillis")) ?? submittedAtMillis;
  const elapsedMillis = Math.max(submittedAtMillis - startedAtMillis, 0);
  const expired =
    elapsedMillis > content.test.duration * 60_000 + SUBMIT_GRACE_MILLIS;

  const answersByQuestionId = new Map(answers.map((a) => [a.questionId, a]));
  let correctCount = 0;
  const answerDocs: ReviewAnswer[] = [];

  for (const question of content.questions) {
    const submitted =
      answersByQuestionId.get(question.id) ?? ({ questionId: question.id } satisfies PracticeAnswerRequest);
    const selectedAnswer = dautoeic.optionLetter(submitted.selectedOptionId);
    const correctAnswer = content.correctAnswerByQuestionId[String(question.id)] ?? null;
    const correct = Boolean(correctAnswer && correctAnswer === selectedAnswer);
    if (correct) correctCount++;
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
  const attemptId = submittedAtMillis;
  const attempt = {
    source: "DAUTOEIC",
    attemptId,
    testId,
    title: content.test.title,
    type: content.test.type,
    difficulty: content.test.difficulty,
    score,
    correctCount,
    questionCount: content.questions.length,
    startedAtMillis,
    submittedAtMillis,
    elapsedMillis,
    expired,
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
    .doc(String(testId))
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

function practiceDraftRef(uid: string, testId: number) {
  return adminDb
    .collection("users")
    .doc(uid)
    .collection("practiceDrafts")
    .doc(String(testId));
}

async function getOrCreateDraft(
  uid: string,
  testId: number,
): Promise<PracticeDraftState> {
  const ref = practiceDraftRef(uid, testId);
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
    payload: "{}",
    startedAtMillis: now,
    updatedAtMillis: now,
  };
  await ref.set(draft, { merge: true });
  return draft;
}

async function loadContent(routeTestId: number): Promise<PracticeContent> {
  const externalTest = await resolveExternalTest(routeTestId);
  const test = toTestCard(externalTest);
  const questions: PracticeQuestion[] = [];
  const optionsByQuestionId: Record<string, PracticeOption[]> = {};
  const correctAnswerByQuestionId: Record<string, string | null> = {};

  for (let part = 1; part <= 7; part++) {
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
  return {
    attemptId: numberValue(doc.get("attemptId")) ?? Number(doc.id),
    testId: numberValue(doc.get("testId")) ?? 0,
    title: stringValue(doc.get("title")) ?? "Dau TOEIC test",
    type: stringValue(doc.get("type")) ?? "DAUTOEIC",
    difficulty: stringValue(doc.get("difficulty")),
    score: numberValue(doc.get("score")) ?? 0,
    correctCount: numberValue(doc.get("correctCount")) ?? 0,
    questionCount: numberValue(doc.get("questionCount")) ?? 0,
    expired: Boolean(doc.get("expired")),
    submittedAtMillis: numberValue(doc.get("submittedAtMillis")),
  };
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
