import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { COLLECTIONS } from "@/lib/firestore/collections";
import type { DauToeicPassage, DauToeicQuestion, DauToeicSet, DauToeicTest } from "@/types/dautoeic";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";

const SOURCE = "DAUTOEIC";
const WRITE_BATCH_SIZE = 450;
const META_COLLECTION = "dauToeicCanonicalMeta";
const TEST_CATALOG_DOC = "tests";

export interface DauToeicCanonicalPart {
  test: DauToeicTest;
  part: number;
  skill: "listening" | "reading";
  passages: DauToeicPassage[];
  questions: DauToeicQuestion[];
}

export async function writeCanonicalSets(sets: DauToeicSet[]): Promise<void> {
  const now = Date.now();
  for (let index = 0; index < sets.length; index += WRITE_BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const set of sets.slice(index, index + WRITE_BATCH_SIZE)) {
      const routeId = routeIdFor(set.id);
      batch.set(
        adminDb.collection(COLLECTIONS.dauToeicSets).doc(canonicalDocId(routeId)),
        {
          ...set,
          source: SOURCE,
          sourceVersion: DAUTOEIC_SOURCE_VERSION,
          externalId: set.id,
          routeId,
          syncedAtMillis: now,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }
}

export async function readCanonicalSets(): Promise<DauToeicSet[]> {
  const snap = await adminDb
    .collection(COLLECTIONS.dauToeicSets)
    .where("source", "==", SOURCE)
    .get();
  const sets = snap.docs
    .filter((doc) => doc.get("sourceVersion") === DAUTOEIC_SOURCE_VERSION)
    .map((doc) => toSet(doc.data()))
    .filter((set): set is DauToeicSet => Boolean(set?.id));
  sets.sort((a, b) => (a.orderIndex ?? 999_999) - (b.orderIndex ?? 999_999) || a.id.localeCompare(b.id));
  return sets;
}

export async function writeCanonicalTests(
  tests: DauToeicTest[],
  opts: { markComplete?: boolean } = {},
): Promise<void> {
  const now = Date.now();
  for (let index = 0; index < tests.length; index += WRITE_BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const test of tests.slice(index, index + WRITE_BATCH_SIZE)) {
      const routeId = routeIdFor(test.id);
      batch.set(
        adminDb.collection(COLLECTIONS.tests).doc(canonicalDocId(routeId)),
        {
          ...test,
          source: SOURCE,
          sourceVersion: DAUTOEIC_SOURCE_VERSION,
          originalSource: test.source,
          externalId: test.id,
          routeId,
          syncedAtMillis: now,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();
  }
  if (opts.markComplete) {
    await adminDb.collection(META_COLLECTION).doc(TEST_CATALOG_DOC).set(
      {
        source: SOURCE,
        complete: true,
        sourceVersion: DAUTOEIC_SOURCE_VERSION,
        count: tests.length,
        syncedAtMillis: now,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
}

export async function writeCanonicalTest(test: DauToeicTest): Promise<void> {
  await writeCanonicalTests([test]);
}

export async function writeCanonicalPart(partContent: DauToeicCanonicalPart): Promise<void> {
  const routeTestId = routeIdFor(partContent.test.id);
  const now = Date.now();
  const questionIds = partContent.questions.map((question) => routeIdFor(question.id));
  const passageIds = partContent.passages.map((passage) => routeIdFor(passage.id));
  const writes: Array<{
    collection: string;
    id: string;
    data: Record<string, unknown>;
  }> = [];

  writes.push({
    collection: COLLECTIONS.tests,
    id: canonicalDocId(routeTestId),
    data: {
      ...partContent.test,
      source: SOURCE,
      sourceVersion: DAUTOEIC_SOURCE_VERSION,
      originalSource: partContent.test.source,
      externalId: partContent.test.id,
      routeId: routeTestId,
      parts: {
        [String(partContent.part)]: {
          part: partContent.part,
          skill: partContent.skill,
          sourceVersion: DAUTOEIC_SOURCE_VERSION,
          questionIds,
          passageIds,
          questionCount: questionIds.length,
          passageCount: passageIds.length,
          syncedAtMillis: now,
        },
      },
      syncedAtMillis: now,
      updatedAt: FieldValue.serverTimestamp(),
    },
  });

  for (const passage of partContent.passages) {
    const routePassageId = routeIdFor(passage.id);
    writes.push({
      collection: COLLECTIONS.questionGroups,
      id: canonicalDocId(routePassageId),
      data: {
        ...passage,
        source: SOURCE,
        externalId: passage.id,
        routeId: routePassageId,
        routeTestId,
        syncedAtMillis: now,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  }

  for (const question of partContent.questions) {
    const routeQuestionId = routeIdFor(question.id);
    const correctAnswer = cleanAnswer(question.correctAnswer);
    writes.push({
      collection: COLLECTIONS.testQuestions,
      id: canonicalDocId(routeQuestionId),
      data: {
        ...question,
        source: SOURCE,
        externalId: question.id,
        routeId: routeQuestionId,
        routeTestId,
        routePassageId: question.passageId ? routeIdFor(question.passageId) : null,
        correctAnswer,
        syncedAtMillis: now,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });

    for (const [letter, content] of optionEntries(question)) {
      const optionId = routeQuestionId * 10 + optionSuffix(letter);
      writes.push({
        collection: COLLECTIONS.answerOptions,
        id: canonicalDocId(optionId),
        data: {
          source: SOURCE,
          id: optionId,
          questionId: routeQuestionId,
          externalQuestionId: question.id,
          letter,
          content,
          correct: letter === correctAnswer,
          syncedAtMillis: now,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }

    if (correctAnswer) {
      writes.push({
        collection: COLLECTIONS.acceptedAnswers,
        id: canonicalDocId(routeQuestionId),
        data: {
          source: SOURCE,
          questionId: routeQuestionId,
          externalQuestionId: question.id,
          answerText: correctAnswer,
          caseSensitive: false,
          syncedAtMillis: now,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
    }
  }

  for (let index = 0; index < writes.length; index += WRITE_BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const write of writes.slice(index, index + WRITE_BATCH_SIZE)) {
      batch.set(adminDb.collection(write.collection).doc(write.id), write.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function readCanonicalTestByRouteId(routeId: number): Promise<DauToeicTest | null> {
  const snap = await adminDb.collection(COLLECTIONS.tests).doc(canonicalDocId(routeId)).get();
  if (!snap.exists || snap.get("source") !== SOURCE) return null;
  if (snap.get("sourceVersion") !== DAUTOEIC_SOURCE_VERSION) return null;
  return toTest(snap.data());
}

export async function readCanonicalTests(setId?: string | null): Promise<DauToeicTest[]> {
  const meta = await adminDb.collection(META_COLLECTION).doc(TEST_CATALOG_DOC).get();
  if (!meta.exists || meta.get("complete") !== true) return [];
  if (meta.get("sourceVersion") !== DAUTOEIC_SOURCE_VERSION) return [];
  const snap = await adminDb
    .collection(COLLECTIONS.tests)
    .where("source", "==", SOURCE)
    .get();
  const tests = snap.docs
    .filter((doc) => doc.get("sourceVersion") === DAUTOEIC_SOURCE_VERSION)
    .map((doc) => toTest(doc.data()))
    .filter((test): test is DauToeicTest => Boolean(test?.id))
    .filter((test) => !setId?.trim() || test.setId === setId.trim());
  tests.sort((a, b) => (a.orderIndex ?? 999_999) - (b.orderIndex ?? 999_999) || a.id.localeCompare(b.id));
  return tests;
}

export async function readCanonicalPart(
  routeTestId: number,
  part: number,
): Promise<DauToeicCanonicalPart | null> {
  const testRef = adminDb.collection(COLLECTIONS.tests).doc(canonicalDocId(routeTestId));
  const testSnap = await testRef.get();
  if (!testSnap.exists || testSnap.get("source") !== SOURCE) return null;
  const partMeta = recordValue(recordValue(testSnap.get("parts"))[String(part)]);
  if (partMeta.sourceVersion !== DAUTOEIC_SOURCE_VERSION) return null;
  const questionIds = arrayValue(partMeta.questionIds)
    .map(numberValue)
    .filter((id): id is number => id != null && id > 0);
  if (questionIds.length === 0) return null;
  const passageIds = arrayValue(partMeta.passageIds)
    .map(numberValue)
    .filter((id): id is number => id != null && id > 0);

  const [questionSnaps, passageSnaps] = await Promise.all([
    adminDb.getAll(
      ...questionIds.map((id) => adminDb.collection(COLLECTIONS.testQuestions).doc(canonicalDocId(id))),
    ),
    passageIds.length
      ? adminDb.getAll(
          ...passageIds.map((id) => adminDb.collection(COLLECTIONS.questionGroups).doc(canonicalDocId(id))),
        )
      : Promise.resolve([]),
  ]);

  const questions = questionSnaps
    .filter((snap) => snap.exists && snap.get("source") === SOURCE)
    .map((snap) => toQuestion(snap.data()))
    .filter((question): question is DauToeicQuestion => Boolean(question?.id))
    .sort((a, b) => (a.questionNumber ?? 999_999) - (b.questionNumber ?? 999_999) || (a.orderIndex ?? 999_999) - (b.orderIndex ?? 999_999));
  if (questions.length === 0) return null;

  const passages = passageSnaps
    .filter((snap) => snap.exists && snap.get("source") === SOURCE)
    .map((snap) => toPassage(snap.data()))
    .filter((passage): passage is DauToeicPassage => Boolean(passage?.id))
    .sort((a, b) => (a.orderIndex ?? 999_999) - (b.orderIndex ?? 999_999) || a.id.localeCompare(b.id));

  const test = toTest(testSnap.data());
  if (!test) return null;
  return {
    test,
    part,
    skill: part <= 4 ? "listening" : "reading",
    passages,
    questions,
  };
}

function toSet(data: FirebaseFirestore.DocumentData | undefined): DauToeicSet | null {
  const sourceId = stringValue(data?.externalId) ?? stringValue(data?.id);
  if (!sourceId) return null;
  return {
    id: sourceId,
    name: stringValue(data?.name),
    description: stringValue(data?.description),
    orderIndex: numberValue(data?.orderIndex),
  };
}

function toTest(data: FirebaseFirestore.DocumentData | undefined): DauToeicTest | null {
  const sourceId = stringValue(data?.externalId) ?? stringValue(data?.id);
  if (!sourceId) return null;
  return {
    id: sourceId,
    setId: stringValue(data?.setId),
    setName: stringValue(data?.setName),
    name: stringValue(data?.name),
    description: stringValue(data?.description),
    source: sourceValue(data),
    year: numberValue(data?.year),
    difficultyLevel: numberValue(data?.difficultyLevel),
    totalQuestions: numberValue(data?.totalQuestions),
    listeningDurationSeconds: numberValue(data?.listeningDurationSeconds),
    readingDurationSeconds: numberValue(data?.readingDurationSeconds),
    isFree: booleanValue(data?.isFree),
    isHidden: booleanValue(data?.isHidden),
    orderIndex: numberValue(data?.orderIndex),
    mediaFolder: stringValue(data?.mediaFolder),
    mediaVersion: numberValue(data?.mediaVersion),
  };
}

function toPassage(data: FirebaseFirestore.DocumentData | undefined): DauToeicPassage | null {
  const sourceId = stringValue(data?.externalId) ?? stringValue(data?.id);
  if (!sourceId) return null;
  return {
    id: sourceId,
    testId: stringValue(data?.testId),
    part: numberValue(data?.part),
    passageType: stringValue(data?.passageType),
    audioUrl: stringValue(data?.audioUrl),
    imageUrl: stringValue(data?.imageUrl),
    passageText: stringValue(data?.passageText),
    passageText2: stringValue(data?.passageText2),
    passageText3: stringValue(data?.passageText3),
    transcript: stringValue(data?.transcript),
    orderIndex: numberValue(data?.orderIndex),
    title: stringValue(data?.title),
  };
}

function toQuestion(data: FirebaseFirestore.DocumentData | undefined): DauToeicQuestion | null {
  const sourceId = stringValue(data?.externalId) ?? stringValue(data?.id);
  if (!sourceId) return null;
  return {
    id: sourceId,
    testId: stringValue(data?.testId),
    passageId: stringValue(data?.passageId),
    part: numberValue(data?.part),
    section: stringValue(data?.section),
    questionNumber: numberValue(data?.questionNumber),
    audioUrl: stringValue(data?.audioUrl),
    imageUrl: stringValue(data?.imageUrl),
    passageText: stringValue(data?.passageText),
    questionText: stringValue(data?.questionText),
    optionA: stringValue(data?.optionA),
    optionB: stringValue(data?.optionB),
    optionC: stringValue(data?.optionC),
    optionD: stringValue(data?.optionD),
    correctAnswer: cleanAnswer(stringValue(data?.correctAnswer)),
    explanationVi: stringValue(data?.explanationVi),
    explanationEn: stringValue(data?.explanationEn),
    difficultyLevel: numberValue(data?.difficultyLevel),
    orderIndex: numberValue(data?.orderIndex),
    translationVi: stringValue(data?.translationVi),
    vocabulary: stringValue(data?.vocabulary),
    answerTranslationVi: stringValue(data?.answerTranslationVi),
  };
}

function optionEntries(question: DauToeicQuestion): Array<[string, string]> {
  return [
    ["A", question.optionA],
    ["B", question.optionB],
    ["C", question.optionC],
    ["D", question.optionD],
  ].filter((entry): entry is [string, string] => {
    const [letter, content] = entry;
    if (question.part === 2 && letter === "D") return false;
    return Boolean(content?.trim());
  });
}

function optionSuffix(letter: string): number {
  return letter === "A" ? 1 : letter === "B" ? 2 : letter === "C" ? 3 : letter === "D" ? 4 : 0;
}

function canonicalDocId(routeId: number): string {
  return `dautoeic_${routeId}`;
}

function cleanAnswer(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim().slice(0, 1).toUpperCase() : null;
}

function sourceValue(data: FirebaseFirestore.DocumentData | undefined): string | null {
  return stringValue(data?.originalSource) ?? null;
}

function routeIdFor(value: string): number {
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  const crc = crc32(trimmed);
  return crc === 0 ? 1 : crc;
}

let crcTable: number[] | null = null;

function crc32(value: string): number {
  const table = crcTable ?? buildCrcTable();
  crcTable = table;
  let crc = 0 ^ -1;
  const bytes = new TextEncoder().encode(value);
  for (const b of bytes) {
    crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function buildCrcTable(): number[] {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
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

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
