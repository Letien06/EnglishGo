import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import type { DauToeicTest } from "@/types/dautoeic";
import { listTests, routeTestId } from "./dautoeic";
import { isDriveContentEnabled } from "./dautoeic-drive";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";

const TEST_INDEX = `dauToeicSources/${DAUTOEIC_SOURCE_VERSION}/dauToeicTestIndex`;

export interface TestIndexQuery {
  difficulty?: string | null;
  search?: string | null;
  cursor?: string | null;
  size: number;
}

export interface TestIndexPage {
  tests: DauToeicTest[];
  total: number;
  nextCursor?: string;
}

interface TestIndexDoc extends DauToeicTest {
  routeId: number;
  orderIndexSort: number;
  searchTokens: string[];
}

export async function writeTestIndex(tests: DauToeicTest[]): Promise<void> {
  if (isDriveContentEnabled()) return;
  for (let index = 0; index < tests.length; index += 450) {
    const batch = adminDb.batch();
    for (const test of tests.slice(index, index + 450)) {
      const doc = toIndexDoc(test);
      batch.set(adminDb.collection(TEST_INDEX).doc(String(doc.routeId)), {
        ...doc,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function queryTestIndex({
  difficulty,
  search,
  cursor,
  size,
}: TestIndexQuery): Promise<TestIndexPage> {
  const safeSize = Math.min(Math.max(size, 1), 50);
  if (isDriveContentEnabled()) {
    const tests = (await listTests(null)).map(toIndexDoc)
      .filter((test) => !difficulty?.trim() || test.difficultyLevel === Number(difficulty.trim()))
      .filter((test) => !search?.trim() || test.searchTokens.includes(normalizeToken(search)))
      .sort((first, second) => first.orderIndexSort - second.orderIndexSort || compareIds(String(first.routeId), String(second.routeId)));
    const after = cursor?.trim() ? parseCursor(cursor) : null;
    const remaining = after ? tests.filter((test) => test.orderIndexSort > after.orderIndexSort || (test.orderIndexSort === after.orderIndexSort && String(test.routeId) > after.docId)) : tests;
    const page = remaining.slice(0, safeSize);
    const last = page.at(-1);
    return { tests: page.map(fromIndexDoc), total: tests.length, nextCursor: remaining.length > safeSize && last ? makeCursor(last.orderIndexSort, String(last.routeId)) : undefined };
  }
  let baseQuery: FirebaseFirestore.Query = adminDb.collection(TEST_INDEX);
  if (difficulty?.trim()) {
    baseQuery = baseQuery.where("difficultyLevel", "==", Number(difficulty.trim()));
  }
  if (search?.trim()) {
    baseQuery = baseQuery.where("searchTokens", "array-contains", normalizeToken(search));
  }

  let itemsQuery = baseQuery
    .orderBy("orderIndexSort", "asc")
    .orderBy(FieldPath.documentId(), "asc")
    .limit(safeSize);

  if (cursor?.trim()) {
    const parsed = parseCursor(cursor);
    itemsQuery = itemsQuery.startAfter(parsed.orderIndexSort, parsed.docId);
  }

  const [itemsSnap, totalSnap] = await Promise.all([
    itemsQuery.get(),
    baseQuery.count().get(),
  ]);
  const tests = itemsSnap.docs.map((doc) => fromIndexDoc(doc.data()));
  const lastDoc = itemsSnap.docs.at(-1);
  return {
    tests,
    total: totalSnap.data().count,
    nextCursor:
      itemsSnap.docs.length === safeSize && lastDoc
        ? makeCursor(
            numberValue(lastDoc.get("orderIndexSort")) ?? 999_999,
            lastDoc.id,
          )
        : undefined,
  };
}

export async function hasTestIndex(): Promise<boolean> {
  if (isDriveContentEnabled()) return true;
  const snap = await adminDb.collection(TEST_INDEX).limit(1).get();
  return !snap.empty;
}

function compareIds(first: string, second: string) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function toIndexDoc(test: DauToeicTest): TestIndexDoc {
  return {
    ...test,
    routeId: routeTestId(test.id),
    orderIndexSort: test.orderIndex ?? 999_999,
    searchTokens: buildSearchTokens(test.name, test.setName, test.source),
  };
}

function fromIndexDoc(data: FirebaseFirestore.DocumentData): DauToeicTest {
  return {
    id: stringValue(data.id) ?? "",
    setId: stringValue(data.setId),
    setName: stringValue(data.setName),
    name: stringValue(data.name),
    description: stringValue(data.description),
    source: stringValue(data.source),
    year: numberValue(data.year),
    difficultyLevel: numberValue(data.difficultyLevel),
    totalQuestions: numberValue(data.totalQuestions),
    listeningDurationSeconds: numberValue(data.listeningDurationSeconds),
    readingDurationSeconds: numberValue(data.readingDurationSeconds),
    isFree: booleanValue(data.isFree),
    isHidden: booleanValue(data.isHidden),
    orderIndex: numberValue(data.orderIndex),
    mediaFolder: stringValue(data.mediaFolder),
    mediaVersion: numberValue(data.mediaVersion),
  };
}

function buildSearchTokens(...values: Array<string | null>): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of String(value ?? "").toLowerCase().split(/[^a-z0-9]+/i)) {
      if (token) tokens.add(token);
    }
  }
  return [...tokens];
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean)[0] ?? "";
}

function makeCursor(orderIndexSort: number, docId: string): string {
  return Buffer.from(JSON.stringify({ orderIndexSort, docId })).toString("base64url");
}

function parseCursor(cursor: string): { orderIndexSort: number; docId: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      orderIndexSort?: unknown;
      docId?: unknown;
    };
    const orderIndexSort = numberValue(parsed.orderIndexSort);
    const docId = stringValue(parsed.docId);
    if (orderIndexSort == null || !docId) throw new Error("Invalid cursor");
    return { orderIndexSort, docId };
  } catch {
    throw new Error("Invalid test cursor");
  }
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
