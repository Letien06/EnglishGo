import { adminDb } from "@/lib/firestore/db";
import { BadRequest, NotFound } from "@/lib/api/response";
import { FieldPath } from "firebase-admin/firestore";
import { unstable_cache } from "next/cache";
import type { AppUser } from "@/types";
import type { DauToeicQuestion, DauToeicTest } from "@/types/dautoeic";
import * as dautoeic from "./dautoeic";
import { addScore } from "./community";
import { recordStudyActivity } from "./study-activity";
import {
  hasTestIndex,
  queryTestIndex,
  writeTestIndex,
} from "./dautoeic-test-index";
import { enforceDailyActionLimit } from "./rate-limit";

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
  scoreBreakdown: PracticeScoreBreakdown;
}

export interface PracticePartBreakdown {
  part: number;
  skill: "LISTENING" | "READING";
  total: number;
  correct: number;
  percent: number;
  projectedScaledScore: number;
  questionWeight: number;
}

export interface PracticeSkillBreakdown {
  skill: "LISTENING" | "READING";
  correct: number;
  total: number;
  selectedParts: number[];
  coverageQuestions: number;
  coveragePercent: number;
  equivalentCorrect100: number;
  projectedScaledScore: number;
  questionWeight: number;
}

export interface PracticeScoreBreakdown {
  listening: PracticeSkillBreakdown | null;
  reading: PracticeSkillBreakdown | null;
  totalProjectedScore: number | null;
  maxScore: number;
  note: string;
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
  scoreBreakdown: PracticeScoreBreakdown;
}

export interface ReviewAnswer {
  questionId: number;
  part: number;
  weakTag: string;
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

interface PracticeAnswerKeyContent {
  test: PracticeTestCard;
  questions: Array<{ id: number; part: number; content?: string; explanation?: string | null }>;
  correctAnswerByQuestionId: Record<string, string | null>;
}

interface PracticePartContentSnapshot {
  questions: PracticeQuestion[];
  optionsByQuestionId: Record<string, PracticeOption[]>;
  correctAnswerByQuestionId: Record<string, string | null>;
}

interface PracticeDraftState {
  payload: string;
  startedAtMillis: number;
  updatedAtMillis: number;
  currentQuestionIndex: number;
}

export interface PracticeDraftView {
  testId: number;
  config: PracticeSessionConfig;
  payload: string;
  startedAtMillis: number;
  updatedAtMillis: number;
  currentQuestionIndex: number;
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
const TOEIC_SECTION_QUESTIONS = 100;
const TOEIC_SECTION_MIN_SCORE = 5;
const TOEIC_SECTION_MAX_SCORE = 495;
const TOEIC_SCORE_NOTE =
  "TOEIC estimate only: official raw-to-scaled conversion varies by test form.";
const PRACTICE_CACHE_VERSION = "v6";
const PRACTICE_CACHE_TTL_MILLIS = 24 * 60 * 60 * 1000;
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
  return cachedFindTests(type ?? null, difficulty ?? null, cursor ?? null, safeSize);
}

const cachedFindTests = unstable_cache(
  async (
    type: string | null,
    difficulty: string | null,
    cursor: string | null,
    safeSize: number,
  ): Promise<{ items: PracticeTestCard[]; total: number; size: number; nextCursor?: string }> => {
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
  },
  ["practice-tests-page"],
  { revalidate: 600 },
);

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
    test: content.test,
    questions: content.questions,
    optionsByQuestionId: publicOptionsByQuestionId(content.optionsByQuestionId),
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
  currentQuestionIndex?: number | null,
): Promise<PracticeDraftView> {
  const config = normalizeSessionConfig(input, testId);
  const updatedAtMillis = Date.now();
  await enforceDailyActionLimit(uid, "practice-draft", 1500);
  const draftRef = practiceDraftRef(uid, config.sessionKey);
  const snap = await draftRef.get();
  const startedAtMillis =
    numberValue(snap.get("startedAtMillis")) ?? updatedAtMillis;
  const answerKey = await loadAnswerKey(testId, config.parts);
  const safeCurrentQuestionIndex = normalizeCurrentQuestionIndex(
    currentQuestionIndex,
    answerKey.questions.length,
  );
  const safePayload = normalizeDraftPayload(
    payload,
    new Set(answerKey.questions.map((question) => question.id)),
    config,
    startedAtMillis,
    updatedAtMillis,
    safeCurrentQuestionIndex,
  );
  await draftRef.set(
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
      currentQuestionIndex: safeCurrentQuestionIndex,
    },
    { merge: true },
  );
  return {
    testId,
    config,
    payload: safePayload,
    startedAtMillis,
    updatedAtMillis,
    currentQuestionIndex: safeCurrentQuestionIndex,
  };
}

export async function getDraft(
  uid: string,
  testId: number,
  input?: PracticeSessionInput,
): Promise<PracticeDraftView | null> {
  const config = normalizeSessionConfig(input, testId);
  const snap = await practiceDraftRef(uid, config.sessionKey).get();
  if (!snap.exists) return null;
  return {
    testId,
    config,
    payload: stringValue(snap.get("payload")) ?? "{}",
    startedAtMillis: numberValue(snap.get("startedAtMillis")) ?? Date.now(),
    updatedAtMillis: numberValue(snap.get("updatedAtMillis")) ?? 0,
    currentQuestionIndex: numberValue(snap.get("currentQuestionIndex")) ?? 0,
  };
}

export async function deleteDraft(
  uid: string,
  testId: number,
  input?: PracticeSessionInput,
): Promise<{ deleted: true; sessionKey: string }> {
  const config = normalizeSessionConfig(input, testId);
  await practiceDraftRef(uid, config.sessionKey).delete().catch(() => undefined);
  return { deleted: true, sessionKey: config.sessionKey };
}

export async function warmupPracticeContent(
  testId: number,
  input?: PracticeSessionInput,
): Promise<{
  testId: number;
  mode: PracticeMode;
  parts: number[];
  durationMinutes: number;
  questionCount: number;
  audioCount: number;
  imageCount: number;
  answerKeyCount: number;
  warmedAtMillis: number;
}> {
  const config = normalizeSessionConfig(input, testId);
  const content = await loadContent(testId, config.parts);
  const answerKey = buildAnswerKeyFromContent(content);
  await writeAnswerKeyCache(testId, config.parts, answerKey);
  return {
    testId,
    mode: config.mode,
    parts: config.parts,
    durationMinutes: config.durationMinutes,
    questionCount: content.questions.length,
    audioCount: content.questions.filter((question) => question.audioUrl).length,
    imageCount: content.questions.filter((question) => question.imageUrl).length,
    answerKeyCount: answerKey.questions.length,
    warmedAtMillis: Date.now(),
  };
}

export async function submit(
  user: AppUser,
  testId: number,
  answers: PracticeAnswerRequest[],
  input?: PracticeSessionInput,
): Promise<PracticeSubmissionResponse> {
  const config = normalizeSessionConfig(input, testId);
  const answerKey = await loadAnswerKey(testId, config.parts);
  if (answerKey.questions.length === 0) {
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

  for (const question of answerKey.questions) {
    const submitted =
      answersByQuestionId.get(question.id) ?? ({ questionId: question.id } satisfies PracticeAnswerRequest);
    const selectedAnswer = dautoeic.optionLetter(submitted.selectedOptionId);
    const correctAnswer = answerKey.correctAnswerByQuestionId[String(question.id)] ?? null;
    const correct = Boolean(correctAnswer && correctAnswer === selectedAnswer);
    if (correct) correctCount++;
    const currentPartStats = partStats.get(question.part) ?? { total: 0, correct: 0 };
    currentPartStats.total += 1;
    if (correct) currentPartStats.correct += 1;
    partStats.set(question.part, currentPartStats);
    answerDocs.push({
      questionId: question.id,
      part: question.part,
      weakTag: classifyPracticeWeakTag(question.part, question.content),
      questionText: question.content ?? "",
      explanation: question.explanation ?? null,
      selectedOptionId: submitted.selectedOptionId ?? null,
      selectedAnswer,
      correctAnswer,
      correct,
      textResponse: submitted.textResponse ?? null,
      options: [],
    });
  }

  const score = round2((correctCount * 100) / answerKey.questions.length);
  const scoreBreakdown = buildScoreBreakdown(partStats, config.parts);
  const partBreakdown = config.parts
    .map((part) => {
      const stat = partStats.get(part) ?? { total: 0, correct: 0 };
      const percent = stat.total > 0 ? round2((stat.correct * 100) / stat.total) : 0;
      return {
        part,
        skill: PART_DEFAULTS[part]?.skill ?? (part <= 4 ? "LISTENING" as const : "READING" as const),
        total: stat.total,
        correct: stat.correct,
        percent,
        projectedScaledScore: estimateScaledScore(stat.correct, stat.total),
        questionWeight: questionWeightForPart(part),
      };
    })
    .filter((part) => part.total > 0);
  const attemptId = submittedAtMillis;
  const attempt = {
    source: "DAUTOEIC",
    attemptId,
    testId,
    title: answerKey.test.title,
    type: answerKey.test.type,
    difficulty: answerKey.test.difficulty,
    mode: config.mode,
    parts: config.parts,
    durationMinutes: config.durationMinutes,
    sessionKey: config.sessionKey,
    score,
    correctCount,
    questionCount: answerKey.questions.length,
    startedAtMillis,
    submittedAtMillis,
    elapsedMillis,
    expired,
    partBreakdown,
    scoreBreakdown,
    answers: answerDocs,
  };
  await Promise.all([
    adminDb
      .collection("users")
      .doc(user.uid)
      .collection("practiceAttempts")
      .doc(String(attemptId))
      .set(attempt, { merge: true }),
    adminDb
      .collection("users")
      .doc(user.uid)
      .collection("practiceDrafts")
      .doc(config.sessionKey)
      .delete()
      .catch(() => undefined),
    updatePracticeWeakAreas(user.uid, attempt).catch(() => undefined),
    addScore(user, score).catch(() => undefined),
    recordStudyActivity(user.uid, {
      module: "practice",
      activityType: config.mode === "exam" ? "practice_exam_submit" : "practice_part_submit",
      sourceId: attemptId,
      occurredAtMillis: submittedAtMillis,
    }).catch(() => undefined),
  ]);
  return {
    attemptId,
    score,
    correctCount,
    questionCount: answerKey.questions.length,
    expired,
    elapsedMillis,
    scoreBreakdown,
  };
}

async function updatePracticeWeakAreas(
  uid: string,
  attempt: {
    attemptId: number;
    testId: number;
    title: string;
    mode: PracticeMode;
    parts: number[];
    partBreakdown: PracticePartBreakdown[];
    answers?: ReviewAnswer[];
    submittedAtMillis: number;
  },
): Promise<void> {
  const weakest = [...attempt.partBreakdown]
    .filter((part) => part.total > 0)
    .sort((a, b) => a.percent - b.percent || b.total - a.total)
    .at(0);
  if (!weakest) return;

  const recommendation = {
    type: "practice_part",
    label: `Luyen tiep Part ${weakest.part}`,
    href: `/practice/session/${attempt.testId}?mode=part&parts=${weakest.part}&time=${PART_DEFAULTS[weakest.part]?.suggestedMinutes ?? 20}`,
    reason: `Part ${weakest.part} dat ${weakest.correct}/${weakest.total} cau dung (${weakest.percent}%).`,
    updatedAtMillis: attempt.submittedAtMillis,
  };

  await adminDb.collection("users").doc(uid).set(
    {
      practiceWeakAreas: attempt.partBreakdown,
      practiceWeakTags: buildWeakTagBreakdown(attempt.answers ?? []),
      nextPracticeRecommendation: recommendation,
      lastPracticeAttemptId: attempt.attemptId,
      lastPracticeTitle: attempt.title,
      updatedAtMillis: Date.now(),
    },
    { merge: true },
  );
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
  const answers = await enrichReviewAnswers(
    attempt,
    arrayValue(snap.get("answers")).map(toReviewAnswer),
  );
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

function practicePartContentCacheRef(routeTestId: number, part: number) {
  return adminDb
    .collection("practicePartContentCache")
    .doc(`${PRACTICE_CACHE_VERSION}_${routeTestId}_part_${part}`);
}

function practiceAnswerKeyCacheRef(routeTestId: number, parts: number[]) {
  return adminDb
    .collection("practiceAnswerKeyCache")
    .doc(`${PRACTICE_CACHE_VERSION}_${routeTestId}_parts_${normalizeParts(parts).join("-")}`);
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
      currentQuestionIndex: numberValue(snap.get("currentQuestionIndex")) ?? 0,
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
    currentQuestionIndex: 0,
  };
  await ref.set(draft, { merge: true });
  return draft;
}

async function loadContent(routeTestId: number, parts: number[] = [...ALL_PARTS]): Promise<PracticeContent> {
  const normalizedParts = normalizeParts(parts);
  return cachedLoadContent(routeTestId, normalizedParts.join(","));
}

const cachedLoadContent = unstable_cache(
  async (routeTestId: number, partsKey: string): Promise<PracticeContent> => {
    const parts = normalizeParts(partsKey);
    return loadContentUncached(routeTestId, parts);
  },
  ["practice-content-v3"],
  { revalidate: 3600 },
);

async function loadContentUncached(routeTestId: number, parts: number[]): Promise<PracticeContent> {
  const externalTest = await resolveExternalTest(routeTestId);
  const test = toTestCard(externalTest);
  const questions: PracticeQuestion[] = [];
  const optionsByQuestionId: Record<string, PracticeOption[]> = {};
  const correctAnswerByQuestionId: Record<string, string | null> = {};

  const partContents = await Promise.all(parts.map((part) => loadPartContentSnapshot(routeTestId, externalTest, part)));
  for (const partContent of partContents) {
    questions.push(...partContent.questions);
    Object.assign(optionsByQuestionId, partContent.optionsByQuestionId);
    Object.assign(correctAnswerByQuestionId, partContent.correctAnswerByQuestionId);
  }

  questions.sort((a, b) => a.part - b.part || a.id - b.id);
  return { test, questions, optionsByQuestionId, correctAnswerByQuestionId };
}

async function loadPartContentSnapshot(
  routeTestId: number,
  externalTest: DauToeicTest,
  part: number,
): Promise<PracticePartContentSnapshot> {
  const ref = practicePartContentCacheRef(routeTestId, part);
  const snap = await ref.get();
  if (isFreshCacheSnapshot(snap)) {
    return {
      questions: arrayValue(snap.get("questions")).map(toCachedQuestion),
      optionsByQuestionId: toCachedOptionsByQuestionId(snap.get("optionsByQuestionId")),
      correctAnswerByQuestionId: toCachedAnswerMap(snap.get("correctAnswerByQuestionId")),
    };
  }

  const partContent = await dautoeic.getPart(externalTest.id, part);
  const questions: PracticeQuestion[] = [];
  const optionsByQuestionId: Record<string, PracticeOption[]> = {};
  const correctAnswerByQuestionId: Record<string, string | null> = {};
  const test = toTestCard(externalTest);
  for (const externalQuestion of partContent.questions) {
    const question = toQuestion(test, externalQuestion);
    questions.push(question);
    optionsByQuestionId[String(question.id)] = toOptions(question, externalQuestion);
    correctAnswerByQuestionId[String(question.id)] = cleanAnswer(externalQuestion.correctAnswer);
  }
  const snapshot = { questions, optionsByQuestionId, correctAnswerByQuestionId };
  await ref.set(
    {
      schemaVersion: PRACTICE_CACHE_VERSION,
      source: "DAUTOEIC",
      routeTestId,
      externalTestId: externalTest.id,
      part,
      ...snapshot,
      updatedAtMillis: Date.now(),
    },
    { merge: true },
  ).catch(() => undefined);
  return snapshot;
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

async function loadAnswerKey(routeTestId: number, parts: number[]): Promise<PracticeAnswerKeyContent> {
  const normalizedParts = normalizeParts(parts);
  const ref = practiceAnswerKeyCacheRef(routeTestId, normalizedParts);
  const snap = await ref.get();
  if (isFreshCacheSnapshot(snap)) {
    const data = recordValue(snap.data());
    const test = toCachedTestCard(data.test);
    const questions = arrayValue(data.questions)
      .map((value) => {
        const item = recordValue(value);
        return {
          id: numberValue(item.id) ?? 0,
          part: numberValue(item.part) ?? 1,
          content: stringValue(item.content) ?? "",
          explanation: stringValue(item.explanation),
        };
      })
      .filter((question) => question.id > 0);
    if (test && questions.length > 0) {
      return {
        test,
        questions,
        correctAnswerByQuestionId: toCachedAnswerMap(data.correctAnswerByQuestionId),
      };
    }
  }

  const content = await loadContent(routeTestId, normalizedParts);
  const answerKey = buildAnswerKeyFromContent(content);
  await writeAnswerKeyCache(routeTestId, normalizedParts, answerKey);
  return answerKey;
}

function buildAnswerKeyFromContent(content: PracticeContent): PracticeAnswerKeyContent {
  return {
    test: content.test,
    questions: content.questions.map((question) => ({
      id: question.id,
      part: question.part,
      content: question.content,
      explanation: question.explanation,
    })),
    correctAnswerByQuestionId: content.correctAnswerByQuestionId,
  };
}

async function writeAnswerKeyCache(
  routeTestId: number,
  parts: number[],
  answerKey: PracticeAnswerKeyContent,
): Promise<void> {
  await practiceAnswerKeyCacheRef(routeTestId, parts).set(
    {
      schemaVersion: PRACTICE_CACHE_VERSION,
      routeTestId,
      parts,
      ...answerKey,
      updatedAtMillis: Date.now(),
    },
    { merge: true },
  ).catch(() => undefined);
}

async function enrichReviewAnswers(attempt: PracticeAttempt, answers: ReviewAnswer[]): Promise<ReviewAnswer[]> {
  const content = await loadContent(attempt.testId, attempt.parts).catch(() => null);
  if (!content) return answers;
  const questionById = new Map(content.questions.map((question) => [question.id, question]));
  return answers.map((answer) => {
    const question = questionById.get(answer.questionId);
    return {
      ...answer,
      part: question?.part ?? answer.part,
      questionText: answer.questionText || question?.content || `Question ${answer.questionId}`,
      weakTag: answer.weakTag || classifyPracticeWeakTag(question?.part ?? answer.part, question?.content ?? answer.questionText),
      explanation: answer.explanation || question?.explanation || null,
      options: answer.options.length > 0 ? answer.options : content.optionsByQuestionId[String(answer.questionId)] ?? [],
    };
  });
}

function publicOptionsByQuestionId(optionsByQuestionId: Record<string, PracticeOption[]>): Record<string, PracticeOption[]> {
  return Object.fromEntries(
    Object.entries(optionsByQuestionId).map(([questionId, options]) => [
      questionId,
      options.map((option) => ({ id: option.id, content: option.content, correct: false })),
    ]),
  );
}

function toQuestion(
  test: PracticeTestCard,
  externalQuestion: DauToeicQuestion,
): PracticeQuestion {
  const id = dautoeic.routeQuestionId(externalQuestion.id);
  const part = externalQuestion.part ?? 1;
  return {
    id,
    part,
    skillType: part <= 4 ? "LISTENING" : "READING",
    type: "MULTIPLE_CHOICE",
    content: normalizeQuestionContent(part, externalQuestion.questionText, id),
    audioUrl: externalQuestion.audioUrl,
    imageUrl: externalQuestion.imageUrl,
    explanation: cleanDisplayText(externalQuestion.explanationVi || externalQuestion.explanationEn),
    group: externalQuestion.passageText
      ? {
          id: dautoeic.routeQuestionId(externalQuestion.passageId || externalQuestion.id),
          title: `Part ${part}`.trim(),
          passageText: cleanDisplayText(externalQuestion.passageText),
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
    .filter((entry): entry is [string, string] => {
      const [letter, content] = entry;
      if (question.part === 2 && letter === "D") return false;
      return Boolean(cleanDisplayText(content).trim());
    })
    .map(([letter, content]) => ({
      id: dautoeic.optionId(question.id, letter),
      content: `${letter}. ${cleanDisplayText(content)}`,
      correct: letter === correct,
    }));
}

function toAttempt(doc: FirebaseFirestore.DocumentSnapshot): PracticeAttempt {
  const parts = arrayValue(doc.get("parts"))
    .map(numberValue)
    .filter((part): part is number => part != null && part >= 1 && part <= 7);
  const partBreakdown = arrayValue(doc.get("partBreakdown")).map(toPartBreakdown);
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
    partBreakdown,
    scoreBreakdown: toScoreBreakdown(doc.get("scoreBreakdown"), partBreakdown, parts),
  };
}

function toPartBreakdown(value: unknown): PracticePartBreakdown {
  const data = recordValue(value);
  const part = numberValue(data.part) ?? 1;
  const total = numberValue(data.total) ?? 0;
  const correct = numberValue(data.correct) ?? 0;
  return {
    part,
    skill: data.skill === "READING" ? "READING" : "LISTENING",
    total,
    correct,
    percent: numberValue(data.percent) ?? (total > 0 ? round2((correct * 100) / total) : 0),
    projectedScaledScore: numberValue(data.projectedScaledScore) ?? estimateScaledScore(correct, total),
    questionWeight: numberValue(data.questionWeight) ?? questionWeightForPart(part),
  };
}

function isFreshCacheSnapshot(snap: FirebaseFirestore.DocumentSnapshot): boolean {
  if (!snap.exists) return false;
  if (snap.get("schemaVersion") !== PRACTICE_CACHE_VERSION) return false;
  const updatedAtMillis = numberValue(snap.get("updatedAtMillis")) ?? 0;
  return Date.now() - updatedAtMillis <= PRACTICE_CACHE_TTL_MILLIS;
}

function toCachedTestCard(value: unknown): PracticeTestCard | null {
  const data = recordValue(value);
  const id = numberValue(data.id);
  const externalId = stringValue(data.externalId);
  if (id == null || !externalId) return null;
  return {
    id,
    externalId,
    title: stringValue(data.title) ?? "Dau TOEIC test",
    type: stringValue(data.type) ?? "DAUTOEIC",
    difficulty: stringValue(data.difficulty),
    duration: numberValue(data.duration) ?? DEFAULT_FULL_TEST_MINUTES,
    totalQuestions: numberValue(data.totalQuestions) ?? 200,
  };
}

function toCachedQuestion(value: unknown): PracticeQuestion {
  const data = recordValue(value);
  const group = recordValue(data.group);
  const groupId = numberValue(group.id);
  return {
    id: numberValue(data.id) ?? 0,
    part: numberValue(data.part) ?? 1,
    skillType: data.skillType === "READING" ? "READING" : "LISTENING",
    type: "MULTIPLE_CHOICE",
    content: stringValue(data.content) ?? "",
    audioUrl: stringValue(data.audioUrl),
    imageUrl: stringValue(data.imageUrl),
    explanation: stringValue(data.explanation),
    group: groupId == null
      ? null
      : {
          id: groupId,
          title: stringValue(group.title) ?? "",
          passageText: stringValue(group.passageText) ?? "",
        },
  };
}

function toCachedOptionsByQuestionId(value: unknown): Record<string, PracticeOption[]> {
  const data = recordValue(value);
  return Object.fromEntries(
    Object.entries(data).map(([questionId, options]) => [
      questionId,
      arrayValue(options).map((option) => {
        const item = recordValue(option);
        return {
          id: numberValue(item.id) ?? 0,
          content: stringValue(item.content) ?? "",
          correct: Boolean(item.correct),
        };
      }),
    ]),
  );
}

function toCachedAnswerMap(value: unknown): Record<string, string | null> {
  const data = recordValue(value);
  return Object.fromEntries(
    Object.entries(data).map(([questionId, answer]) => [questionId, stringValue(answer)]),
  );
}

function normalizeAttemptMode(value: unknown): PracticeMode {
  return value === "part" ? "part" : "exam";
}

export function normalizeDraftPayload(
  payload: string | null | undefined,
  allowedQuestionIds: Set<number>,
  config: PracticeSessionConfig,
  startedAtMillis: number,
  updatedAtMillis: number,
  currentQuestionIndex: number,
): string {
  const raw = parseDraftPayload(payload);
  const rawAnswers = recordValue(raw.answers);
  const answers: Record<string, { selectedOptionId: number | null; textResponse: string | null }> = {};
  for (const [questionId, value] of Object.entries(rawAnswers)) {
    const id = Number(questionId);
    if (!Number.isInteger(id) || !allowedQuestionIds.has(id)) continue;
    const answer = recordValue(value);
    answers[String(id)] = {
      selectedOptionId: numberValue(answer.selectedOptionId),
      textResponse: stringValue(answer.textResponse),
    };
  }
  const markedQuestionIds = arrayValue(raw.markedQuestionIds)
    .map(numberValue)
    .filter((id): id is number => id != null && allowedQuestionIds.has(id));

  return JSON.stringify({
    answers,
    markedQuestionIds: [...new Set(markedQuestionIds)],
    currentQuestionIndex,
    startedAtMillis,
    updatedAtMillis,
    config,
  });
}

function parseDraftPayload(payload: string | null | undefined): Record<string, unknown> {
  if (!payload?.trim()) return {};
  try {
    return recordValue(JSON.parse(payload));
  } catch {
    return {};
  }
}

export function normalizeCurrentQuestionIndex(value: unknown, questionCount: number): number {
  const parsed = numberValue(value) ?? 0;
  const max = Math.max(0, questionCount - 1);
  return Math.min(max, Math.max(0, Math.trunc(parsed)));
}

function buildWeakTagBreakdown(answers: ReviewAnswer[]): Array<{
  tag: string;
  part: number;
  wrong: number;
  total: number;
  percentWrong: number;
}> {
  const stats = new Map<string, { tag: string; part: number; wrong: number; total: number }>();
  for (const answer of answers) {
    const tag = answer.weakTag || classifyPracticeWeakTag(answer.part, answer.questionText);
    const current = stats.get(tag) ?? { tag, part: answer.part, wrong: 0, total: 0 };
    current.total += 1;
    if (!answer.correct) current.wrong += 1;
    stats.set(tag, current);
  }
  return [...stats.values()]
    .filter((item) => item.total > 0 && item.wrong > 0)
    .map((item) => ({
      ...item,
      percentWrong: round2((item.wrong * 100) / item.total),
    }))
    .sort((a, b) => b.percentWrong - a.percentWrong || b.wrong - a.wrong)
    .slice(0, 8);
}

function classifyPracticeWeakTag(part: number, content: string | null | undefined): string {
  const text = cleanDisplayText(content).toLowerCase();
  if (part === 1) return "part-1-photo-detail";
  if (part === 2) return "part-2-question-response";
  if (part === 3) return text.includes("where") || text.includes("when") ? "part-3-detail" : "part-3-conversation";
  if (part === 4) return text.includes("purpose") || text.includes("why") ? "part-4-purpose" : "part-4-talk-detail";
  if (part === 5) {
    if (/\b(if|unless|although|because|while|when)\b/.test(text)) return "part-5-clause-connector";
    if (/\b(is|are|was|were|be|been|being|has|have|had)\b/.test(text)) return "part-5-verb-form";
    if (/\b(the|a|an|this|these|those)\b/.test(text)) return "part-5-noun-determiner";
    return "part-5-grammar";
  }
  if (part === 6) return text.length > 180 ? "part-6-text-cohesion" : "part-6-sentence-completion";
  if (part === 7) {
    if (text.includes("implied") || text.includes("infer")) return "part-7-inference";
    if (text.includes("purpose") || text.includes("main")) return "part-7-main-idea";
    return "part-7-detail";
  }
  return `part-${part}-general`;
}

function buildScoreBreakdown(
  partStats: Map<number, { total: number; correct: number }>,
  selectedParts: number[],
): PracticeScoreBreakdown {
  const listening = buildSkillBreakdown("LISTENING", partStats, selectedParts);
  const reading = buildSkillBreakdown("READING", partStats, selectedParts);
  return {
    listening,
    reading,
    totalProjectedScore:
      listening && reading
        ? listening.projectedScaledScore + reading.projectedScaledScore
        : null,
    maxScore: listening && reading ? 990 : 495,
    note: TOEIC_SCORE_NOTE,
  };
}

function buildSkillBreakdown(
  skill: "LISTENING" | "READING",
  partStats: Map<number, { total: number; correct: number }>,
  selectedParts: number[],
): PracticeSkillBreakdown | null {
  const skillParts = selectedParts.filter((part) => PART_DEFAULTS[part]?.skill === skill);
  if (skillParts.length === 0) return null;
  const total = skillParts.reduce((sum, part) => sum + (partStats.get(part)?.total ?? 0), 0);
  const correct = skillParts.reduce((sum, part) => sum + (partStats.get(part)?.correct ?? 0), 0);
  const coverageQuestions = skillParts.reduce((sum, part) => sum + (PART_DEFAULTS[part]?.questionCount ?? 0), 0);
  return {
    skill,
    correct,
    total,
    selectedParts: skillParts,
    coverageQuestions,
    coveragePercent: round2((coverageQuestions * 100) / TOEIC_SECTION_QUESTIONS),
    equivalentCorrect100: total > 0 ? round2((correct * TOEIC_SECTION_QUESTIONS) / total) : 0,
    projectedScaledScore: estimateScaledScore(correct, total),
    questionWeight: total > 0 ? round2((TOEIC_SECTION_MAX_SCORE - TOEIC_SECTION_MIN_SCORE) / total) : 0,
  };
}

function toScoreBreakdown(
  value: unknown,
  partBreakdown: PracticePartBreakdown[],
  selectedParts: number[],
): PracticeScoreBreakdown {
  const data = recordValue(value);
  const listening = toSkillBreakdown(data.listening, "LISTENING");
  const reading = toSkillBreakdown(data.reading, "READING");
  if (listening || reading) {
    return {
      listening,
      reading,
      totalProjectedScore: numberValue(data.totalProjectedScore) ?? (listening && reading ? listening.projectedScaledScore + reading.projectedScaledScore : null),
      maxScore: numberValue(data.maxScore) ?? (listening && reading ? 990 : 495),
      note: stringValue(data.note) ?? TOEIC_SCORE_NOTE,
    };
  }

  const stats = new Map<number, { total: number; correct: number }>();
  for (const part of partBreakdown) {
    stats.set(part.part, { total: part.total, correct: part.correct });
  }
  return buildScoreBreakdown(stats, selectedParts.length > 0 ? selectedParts : [...ALL_PARTS]);
}

function toSkillBreakdown(value: unknown, skill: "LISTENING" | "READING"): PracticeSkillBreakdown | null {
  const data = recordValue(value);
  const total = numberValue(data.total);
  if (total == null) return null;
  const correct = numberValue(data.correct) ?? 0;
  const selectedParts = arrayValue(data.selectedParts)
    .map(numberValue)
    .filter((part): part is number => part != null && part >= 1 && part <= 7);
  return {
    skill,
    correct,
    total,
    selectedParts,
    coverageQuestions: numberValue(data.coverageQuestions) ?? 0,
    coveragePercent: numberValue(data.coveragePercent) ?? 0,
    equivalentCorrect100: numberValue(data.equivalentCorrect100) ?? (total > 0 ? round2((correct * TOEIC_SECTION_QUESTIONS) / total) : 0),
    projectedScaledScore: numberValue(data.projectedScaledScore) ?? estimateScaledScore(correct, total),
    questionWeight: numberValue(data.questionWeight) ?? (total > 0 ? round2((TOEIC_SECTION_MAX_SCORE - TOEIC_SECTION_MIN_SCORE) / total) : 0),
  };
}

function estimateScaledScore(correct: number, total: number): number {
  if (total <= 0) return TOEIC_SECTION_MIN_SCORE;
  const equivalentCorrect = Math.min(TOEIC_SECTION_QUESTIONS, Math.max(0, (correct * TOEIC_SECTION_QUESTIONS) / total));
  const rawScaled = TOEIC_SECTION_MIN_SCORE +
    ((TOEIC_SECTION_MAX_SCORE - TOEIC_SECTION_MIN_SCORE) * equivalentCorrect) / TOEIC_SECTION_QUESTIONS;
  return clampToToeicStep(rawScaled);
}

function questionWeightForPart(part: number): number {
  const count = PART_DEFAULTS[part]?.questionCount ?? 0;
  return count > 0 ? round2((TOEIC_SECTION_MAX_SCORE - TOEIC_SECTION_MIN_SCORE) / count) : 0;
}

function clampToToeicStep(value: number): number {
  const stepped = Math.round(value / 5) * 5;
  return Math.min(TOEIC_SECTION_MAX_SCORE, Math.max(TOEIC_SECTION_MIN_SCORE, stepped));
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

function normalizeQuestionContent(part: number, value: string | null, questionId: number): string {
  if (part === 1 || part === 2) return "";
  const cleaned = removeScriptBlock(cleanDisplayText(value));
  return cleaned || `Question ${questionId}`;
}

function removeScriptBlock(value: string): string {
  const text = value.trim();
  if (!text) return "";
  const scriptIndex = text.search(/\bSCRIPT\s*:/i);
  if (scriptIndex < 0) return text;

  const afterQuestionMarker = text
    .slice(scriptIndex)
    .match(/\b(?:QUESTION|QUESTIONS)\s*:?\s*([\s\S]+)/i);
  if (afterQuestionMarker?.[1]?.trim()) return afterQuestionMarker[1].trim();

  const beforeScript = text.slice(0, scriptIndex).trim();
  return beforeScript;
}

function cleanDisplayText(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function toReviewAnswer(value: unknown): ReviewAnswer {
  const data = recordValue(value);
  const part = numberValue(data.part) ?? 1;
  const questionText = stringValue(data.questionText) ?? "Question";
  return {
    questionId: numberValue(data.questionId) ?? 0,
    part,
    weakTag: stringValue(data.weakTag) ?? classifyPracticeWeakTag(part, questionText),
    questionText,
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
