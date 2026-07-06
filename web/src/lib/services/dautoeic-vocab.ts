import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firestore/db";
import { ApiError, NotFound } from "@/lib/api/response";
import { serverEnv } from "@/lib/env";
import type {
  DauToeicVocabCatalog,
  DauToeicVocabCatalogView,
  DauToeicVocabMeaning,
  DauToeicVocabPart,
  DauToeicVocabPartSummary,
  DauToeicVocabTest,
  DauToeicVocabWord,
} from "@/types/dautoeic";
import type { ContentStatus, SourceType, VocabProgressStatus } from "@/types/vocab";

const SETS = "vocabSets";
const WORDS = "vocabWords";
const PROGRESS = "userVocabProgress";
const SOURCE = "DAUTOEIC";
const CATALOG_REVALIDATE_SECONDS = 600;

export function dautoeicVocabSetId(testId: string): number {
  return stableId(`dautoeic:vocab_test:${testId}`);
}

export function dautoeicVocabWordId(wordId: string): number {
  return stableId(`dautoeic:vocab_word:${wordId}`);
}

export async function getVocabularyCatalogView(
  uid?: string | null,
): Promise<DauToeicVocabCatalogView> {
  const catalog = await getVocabularyCatalog();
  const visibleTests = catalog.tests.filter(isPlayableTest);
  const setNameById = new Map(
    catalog.sets.map((set) => [set.id, cleanName(set.name) || "Dautoeic"]),
  );
  const groupCount = new Map<string, number>();
  for (const test of visibleTests) {
    if (!test.setId) continue;
    groupCount.set(test.setId, (groupCount.get(test.setId) ?? 0) + 1);
  }

  const progressBySetId = uid
    ? await progressStatsForSetIds(
        uid,
        visibleTests.map((test) => dautoeicVocabSetId(test.testId)),
      )
    : new Map<number, ProgressStats>();

  const groups = catalog.sets
    .map((set) => ({
      id: set.id,
      name: cleanName(set.name) || "Dautoeic",
      orderIndex: set.orderIndex,
      count: groupCount.get(set.id) ?? 0,
    }))
    .filter((group) => group.count > 0);

  const cards = visibleTests.map((test) => {
    const internalSetId = dautoeicVocabSetId(test.testId);
    const stats = progressBySetId.get(internalSetId) ?? emptyProgress();
    return {
      id: test.testId,
      internalSetId,
      setId: test.setId ?? "",
      setName: test.setId ? setNameById.get(test.setId) ?? "Dautoeic" : "Dautoeic",
      title: cleanName(test.name) || "Vocabulary test",
      orderIndex: test.orderIndex,
      accessLevel: test.accessLevel,
      partCount: test.partCount,
      wordCount: test.wordCount,
      learnedWords: stats.learnedWords,
      masteredWords: stats.masteredWords,
      dueWords: stats.dueWords,
    };
  });

  return { groups, cards };
}

export async function getDautoeicVocabTestView(
  testId: string,
  uid?: string | null,
): Promise<{
  test: DauToeicVocabTest;
  setName: string;
  internalSetId: number;
  parts: DauToeicVocabPartSummary[];
}> {
  const test = await findCatalogTest(testId);
  const catalog = await getVocabularyCatalog();
  const set = catalog.sets.find((item) => item.id === test.setId);
  const setName = cleanName(set?.name) || "Dautoeic";
  const parts = await listVocabularyParts(testId);
  const internalSetId = dautoeicVocabSetId(testId);
  const [counts, localStats] = await Promise.all([
    wordCountsByPart(parts.map((part) => part.id)),
    uid
      ? progressStatsForParts(uid, internalSetId)
      : Promise.resolve(new Map<string, ProgressStats>()),
  ]);

  const summaries = parts
    .map((part) => {
      const wordCount = counts.get(part.id) ?? 0;
      const stats = localStats.get(part.id) ?? emptyProgress();
      return {
        id: part.id,
        name: cleanName(part.name) || "Words",
        orderIndex: part.orderIndex,
        wordCount,
        learnedWords: stats.learnedWords,
        masteredWords: stats.masteredWords,
        dueWords: stats.dueWords,
        internalSetId,
      };
    })
    .filter((part) => part.wordCount > 0);

  if (!summaries.length) throw NotFound("Dautoeic vocabulary parts not found");

  return {
    test,
    setName,
    internalSetId,
    parts: summaries.sort(
      (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.name.localeCompare(b.name),
    ),
  };
}

export async function syncDautoeicVocabTest(
  testId: string,
  partId?: string | null,
): Promise<{
  setId: number;
  test: DauToeicVocabTest;
  setName: string;
  syncedPartIds: string[];
  wordCount: number;
}> {
  const test = await findCatalogTest(testId);
  const catalog = await getVocabularyCatalog();
  const setName =
    cleanName(catalog.sets.find((item) => item.id === test.setId)?.name) ||
    "Dautoeic";
  const allParts = await listVocabularyParts(testId);
  if (!allParts.length) throw NotFound("Dautoeic vocabulary parts not found");

  const selectedParts = partId?.trim()
    ? allParts.filter((part) => part.id === partId.trim())
    : allParts;
  if (!selectedParts.length) throw NotFound("Dautoeic vocabulary part not found");

  const setId = dautoeicVocabSetId(test.testId);
  const expectedCounts = await wordCountsByPart(selectedParts.map((part) => part.id));
  const now = Date.now();
  await adminDb.collection(SETS).doc(String(setId)).set(
    {
      id: setId,
      title: cleanName(test.name) || "Vocabulary test",
      topic: setName,
      description: `Dautoeic vocabulary test_id=${test.testId}`,
      icon: "book",
      level: test.accessLevel || `${test.partCount} parts`,
      status: "PUBLISHED" satisfies ContentStatus,
      sourceType: SOURCE satisfies SourceType,
      sourceNote: `dautoeic:vocabulary_tests:${test.testId}`,
      licenseNote: "External public Supabase API; cached for learning integration",
      externalSource: SOURCE,
      externalSetId: test.setId,
      externalTestId: test.testId,
      externalAccessLevel: test.accessLevel,
      externalPartCount: test.partCount,
      publishedAtMillis: now,
      updatedAtMillis: now,
      deletedAtMillis: null,
    },
    { merge: true },
  );

  let written = 0;
  for (const part of selectedParts) {
    if (await hasLocalWordsForPart(setId, part.id)) {
      written += expectedCounts.get(part.id) ?? 0;
      continue;
    }
    const words = await getWordsForPart(part.id);
    const writes = words
      .filter((word) => word.id && cleanName(word.word))
      .map((word) => ({
        id: dautoeicVocabWordId(word.id),
        data: mapWordToDoc(word, part, setId, now),
      }));
    await commitWordWrites(writes);
    written += writes.length;
  }

  return {
    setId,
    test,
    setName,
    syncedPartIds: selectedParts.map((part) => part.id),
    wordCount: written,
  };
}

export async function getVocabularyCatalog(): Promise<DauToeicVocabCatalog> {
  return cachedVocabularyCatalog();
}

export async function listVocabularyParts(testId: string): Promise<DauToeicVocabPart[]> {
  const cleanTestId = testId.trim();
  if (!cleanTestId) throw new ApiError("testId is required", 400);
  return cachedVocabularyParts(cleanTestId);
}

async function uncachedVocabularyParts(testId: string): Promise<DauToeicVocabPart[]> {
  const rows = await supabaseGet("/rest/v1/vocabulary_parts", {
    select: "id,test_id,name,order_index",
    test_id: `eq.${testId}`,
    order: "order_index.asc",
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(mapPart);
}

export async function getWordsForPart(partId: string): Promise<DauToeicVocabWord[]> {
  const cleanPartId = partId.trim();
  if (!cleanPartId) throw new ApiError("partId is required", 400);
  return cachedWordsForPart(cleanPartId);
}

async function uncachedWordsForPart(partId: string): Promise<DauToeicVocabWord[]> {
  const rows = await supabasePost("/rest/v1/rpc/get_vocab_words_for_part_fast", {
    p_part_id: partId,
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(mapWord);
}

export async function getWordsForParts(partIds: string[]): Promise<DauToeicVocabWord[]> {
  const cleanPartIds = partIds.map((id) => id.trim()).filter(Boolean);
  if (!cleanPartIds.length) return [];
  const rows = await supabasePost("/rest/v1/rpc/get_vocab_words_for_parts_fast", {
    p_part_ids: cleanPartIds,
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(mapWord);
}

async function findCatalogTest(testId: string): Promise<DauToeicVocabTest> {
  const cleanTestId = testId.trim();
  if (!cleanTestId) throw new ApiError("testId is required", 400);
  const catalog = await getVocabularyCatalog();
  const test = catalog.tests.find((item) => item.testId === cleanTestId);
  if (!test || !isPlayableTest(test)) throw NotFound("Dautoeic vocabulary test not found");
  return test;
}

const cachedVocabularyCatalog = unstable_cache(
  uncachedVocabularyCatalog,
  ["dautoeic-vocab-catalog"],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

const cachedVocabularyParts = unstable_cache(
  uncachedVocabularyParts,
  ["dautoeic-vocab-parts"],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

const cachedWordsForPart = unstable_cache(
  uncachedWordsForPart,
  ["dautoeic-vocab-words-for-part"],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

const cachedWordCountEntriesByPart = unstable_cache(
  uncachedWordCountEntriesByPart,
  ["dautoeic-vocab-word-counts-by-part"],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

async function uncachedVocabularyCatalog(): Promise<DauToeicVocabCatalog> {
  const result = await supabasePost("/rest/v1/rpc/get_vocabulary_catalog", {});
  const raw = asRecord(result);
  const sets = arrayVal(raw, "sets").map((row) => {
    const data = asRecord(row);
    return {
      id: text(data, "id") ?? "",
      name: text(data, "name"),
      orderIndex: integer(data, "order_index"),
    };
  }).filter((set) => set.id);

  const tests = arrayVal(raw, "tests").map((row) => {
    const data = asRecord(row);
    return {
      testId: text(data, "test_id") ?? "",
      setId: text(data, "set_id"),
      name: text(data, "name"),
      partCount: integer(data, "part_count") ?? 0,
      wordCount: integer(data, "word_count") ?? 0,
      orderIndex: integer(data, "order_index"),
      accessLevel: text(data, "access_level"),
    };
  }).filter((test) => test.testId);

  return { sets, tests };
}

async function wordCountsByPart(partIds: string[]): Promise<Map<string, number>> {
  const cleanPartIds = partIds.map((id) => id.trim()).filter(Boolean);
  if (!cleanPartIds.length) return new Map();
  return new Map(await cachedWordCountEntriesByPart(cleanPartIds));
}

async function uncachedWordCountEntriesByPart(
  partIds: string[],
): Promise<Array<[string, number]>> {
  const rows = await supabasePost("/rest/v1/rpc/get_vocabulary_word_counts_by_part", {
    p_part_ids: partIds,
  });
  const counts = new Map<string, number>();
  if (!Array.isArray(rows)) return [];
  for (const row of rows) {
    const data = asRecord(row);
    const partId = text(data, "part_id");
    if (partId) counts.set(partId, integer(data, "word_count") ?? 0);
  }
  return Array.from(counts.entries());
}

async function progressStatsForSetIds(
  uid: string,
  setIds: number[],
): Promise<Map<number, ProgressStats>> {
  const wanted = new Set(setIds);
  const stats = new Map<number, ProgressStats>();
  if (!uid || !wanted.size) return stats;
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection(PROGRESS)
    .get();
  const now = Date.now();
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const setId = numVal(data, "setId") ?? 0;
    if (!wanted.has(setId)) continue;
    addProgress(stats, setId, data, now);
  }
  return stats;
}

async function hasLocalWordsForPart(setId: number, partId: string): Promise<boolean> {
  const snap = await adminDb
    .collection(WORDS)
    .where("setId", "==", setId)
    .where("externalPartId", "==", partId)
    .limit(1)
    .get();
  return !snap.empty;
}

function isPlayableTest(test: DauToeicVocabTest): boolean {
  return !isProAccess(test.accessLevel) && test.wordCount > 0 && test.partCount > 0;
}

function isProAccess(value: string | null): boolean {
  return cleanName(value).toLowerCase() === "pro";
}

async function progressStatsForParts(
  uid: string,
  setId: number,
): Promise<Map<string, ProgressStats>> {
  const [wordsSnap, progressSnap] = await Promise.all([
    adminDb.collection(WORDS).where("setId", "==", setId).get(),
    adminDb
      .collection("users")
      .doc(uid)
      .collection(PROGRESS)
      .where("setId", "==", setId)
      .get(),
  ]);
  const partByWordId = new Map<number, string>();
  for (const doc of wordsSnap.docs) {
    const data = doc.data() ?? {};
    const wordId = numVal(data, "id") ?? Number(doc.id);
    const partId = text(data, "externalPartId");
    if (partId) partByWordId.set(wordId, partId);
  }

  const now = Date.now();
  const stats = new Map<string, ProgressStats>();
  for (const doc of progressSnap.docs) {
    const data = doc.data() ?? {};
    const wordId = numVal(data, "wordId") ?? Number(doc.id);
    const partId = partByWordId.get(wordId);
    if (!partId) continue;
    addProgress(stats, partId, data, now);
  }
  return stats;
}

function addProgress<K>(
  stats: Map<K, ProgressStats>,
  key: K,
  data: Record<string, unknown>,
  now: number,
) {
  const current = stats.get(key) ?? emptyProgress();
  const status = text(data, "status") as VocabProgressStatus | null;
  if (status && status !== "NEW") current.learnedWords++;
  if (status === "MASTERED") current.masteredWords++;
  const nextReviewAtMillis = numVal(data, "nextReviewAtMillis");
  if (status && status !== "NEW" && nextReviewAtMillis != null && nextReviewAtMillis <= now) {
    current.dueWords++;
  }
  stats.set(key, current);
}

interface ProgressStats {
  learnedWords: number;
  masteredWords: number;
  dueWords: number;
}

function emptyProgress(): ProgressStats {
  return { learnedWords: 0, masteredWords: 0, dueWords: 0 };
}

function mapPart(row: Record<string, unknown>): DauToeicVocabPart {
  return {
    id: text(row, "id") ?? "",
    testId: text(row, "test_id"),
    name: text(row, "name"),
    orderIndex: integer(row, "order_index"),
  };
}

function mapWord(row: Record<string, unknown>): DauToeicVocabWord {
  return {
    id: text(row, "id") ?? "",
    partId: text(row, "part_id"),
    word: text(row, "word"),
    ipa: text(row, "ipa"),
    audioUrl: text(row, "audio_url"),
    audioUsUrl: text(row, "audio_us"),
    audioUkUrl: text(row, "audio_uk"),
    imageUrl: text(row, "image_url"),
    meanings: arrayVal(row, "meanings").map((item) => asRecord(item) as DauToeicVocabMeaning),
    phrases: arrayVal(row, "phrases"),
    synonyms: arrayVal(row, "synonyms"),
    orderIndex: integer(row, "order_index"),
    difficultyLevel: integer(row, "difficulty_level"),
  };
}

function mapWordToDoc(
  word: DauToeicVocabWord,
  part: DauToeicVocabPart,
  setId: number,
  now: number,
): Record<string, unknown> {
  const firstMeaning = word.meanings[0] ?? {};
  const parsedIpa = parseIpa(word.ipa);
  return {
    id: dautoeicVocabWordId(word.id),
    setId,
    word: cleanName(word.word) || "",
    meaning: cleanName(firstMeaning.meaning ?? firstMeaning.definition_vi ?? firstMeaning.definition) || "",
    partOfSpeech: normalizePartOfSpeech(firstMeaning.pos ?? firstMeaning.part_of_speech),
    phonetic: word.ipa,
    phoneticUs: parsedIpa.us,
    phoneticUk: parsedIpa.uk,
    example: cleanName(firstMeaning.example),
    audioUrl: word.audioUrl,
    audioUsUrl: word.audioUsUrl,
    audioUkUrl: word.audioUkUrl,
    status: "PUBLISHED" satisfies ContentStatus,
    sourceType: SOURCE satisfies SourceType,
    sourceNote: `dautoeic:vocabulary_words:${word.id}; part_id=${part.id}`,
    licenseNote: "External public Supabase API; cached for learning integration",
    externalSource: SOURCE,
    externalWordId: word.id,
    externalPartId: part.id,
    externalPartName: cleanName(part.name) || "Words",
    externalOrderIndex: word.orderIndex,
    toeicPart: parseToeicPart(part.name),
    difficultyLevel: word.difficultyLevel,
    publishedAtMillis: now,
    updatedAtMillis: now,
    deletedAtMillis: null,
  };
}

async function commitWordWrites(
  writes: Array<{ id: number; data: Record<string, unknown> }>,
): Promise<void> {
  for (let index = 0; index < writes.length; index += 450) {
    const batch = adminDb.batch();
    for (const write of writes.slice(index, index + 450)) {
      batch.set(adminDb.collection(WORDS).doc(String(write.id)), write.data, { merge: true });
    }
    await batch.commit();
  }
}

async function supabaseGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, serverEnv.dauToeicSupabaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return supabaseFetch(url.toString(), { method: "GET" });
}

async function supabasePost(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(path, serverEnv.dauToeicSupabaseUrl);
  return supabaseFetch(url.toString(), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function supabaseFetch(url: string, init: RequestInit): Promise<unknown> {
  const anonKey = serverEnv.dauToeicAnonKey;
  if (!serverEnv.dauToeicSupabaseUrl || !anonKey) {
    throw new ApiError("Dautoeic vocabulary API is not configured", 400);
  }
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      throw new ApiError(`Dautoeic vocabulary API error (${response.status})`, 502);
    }
    return response.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Cannot connect to Dautoeic vocabulary API", 502);
  }
}

function cleanName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePartOfSpeech(value: unknown): string {
  const raw = cleanName(value).toLowerCase();
  switch (raw) {
    case "n":
    case "noun":
      return "NOUN";
    case "v":
    case "verb":
      return "VERB";
    case "adj":
    case "adjective":
      return "ADJ";
    case "adv":
    case "adverb":
      return "ADV";
    default:
      return raw ? raw.toUpperCase() : "OTHER";
  }
}

function parseToeicPart(value: string | null | undefined): number | null {
  const match = cleanName(value).match(/\bpart\s*(\d)\b/i);
  if (!match) return null;
  const part = Number(match[1]);
  return part >= 1 && part <= 7 ? part : null;
}

function parseIpa(value: string | null): { us?: string; uk?: string } {
  const raw = cleanName(value);
  if (!raw) return {};
  const uk = raw.match(/UK:\s*([^|]+)/i)?.[1]?.trim();
  const us = raw.match(/US:\s*([^|]+)/i)?.[1]?.trim();
  return { uk, us };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function arrayVal(data: Record<string, unknown>, key: string): unknown[] {
  const value = data[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function text(obj: Record<string, unknown>, field: string): string | null {
  const value = obj[field];
  if (value == null) return null;
  const textValue = String(value).trim();
  return textValue || null;
}

function integer(obj: Record<string, unknown>, field: string): number | null {
  const value = obj[field];
  if (value == null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null;
}

function numVal(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stableId(value: string): number {
  const crc = crc32(value.trim());
  return crc === 0 ? 1 : crc;
}

let crcTable: number[] | null = null;

function crc32(value: string): number {
  const table = crcTable ?? buildCrcTable();
  crcTable = table;
  let crc = 0 ^ -1;
  const bytes = new TextEncoder().encode(value);
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
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
