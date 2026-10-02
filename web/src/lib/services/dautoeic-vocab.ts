import { unstable_cache } from "next/cache";
import { DAUTOEIC_SOURCE_VERSION, dauToeicApiHeaders } from "./dautoeic-source";
import { adminDb } from "@/lib/firestore/db";
import { ApiError, NotFound } from "@/lib/api/response";
import { serverEnv } from "@/lib/env";
import { vocabularySnapshotSchema, type VocabularySnapshot } from "../storage/vocab-snapshot";
import { contentCacheKey, isDriveContentEnabled, readDriveMaterial } from "./dautoeic-drive";
import type {
  DauToeicVocabCatalog,
  DauToeicVocabCatalogView,
  DauToeicVocabMeaning,
  DauToeicVocabPart,
  DauToeicVocabPartSummary,
  DauToeicVocabTest,
  DauToeicVocabWord,
} from "@/types/dautoeic";
import type { ContentStatus, SourceType, VocabProgressStatus, VocabSetDoc, VocabWordDoc } from "@/types/vocab";

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

export function isDauToeicVocabConfigured(): boolean {
  return isDriveContentEnabled() || Boolean(serverEnv.dauToeicSupabaseUrl && serverEnv.dauToeicAnonKey);
}

function buildVocabularyIndex(snapshot: VocabularySnapshot) {
  const sets = new Map<number, VocabSetDoc>();
  const words = new Map<number, VocabWordDoc>();
  const partsByTest = new Map<string, DauToeicVocabPart[]>();
  const wordsByPart = new Map<string, DauToeicVocabWord[]>();
  const docsBySet = new Map<number, VocabWordDoc[]>();
  const parts = new Map(snapshot.parts.map((part) => [part.id, part]));
  for (const test of snapshot.catalog.tests) {
    const id = dautoeicVocabSetId(test.testId);
    if (sets.has(id)) throw new Error("Vocabulary set ID collision.");
    sets.set(id, { id, title: cleanName(test.name), topic: cleanName(snapshot.catalog.sets.find((set) => set.id === test.setId)?.name),
      status: "PUBLISHED", sourceType: SOURCE, externalSource: SOURCE, externalTestId: test.testId,
      externalSetId: test.setId, wordCount: test.wordCount, icon: "book" });
    docsBySet.set(id, []);
  }
  for (const part of snapshot.parts) {
    const group = partsByTest.get(part.testId) ?? [];
    group.push(part);
    partsByTest.set(part.testId, group);
    wordsByPart.set(part.id, []);
  }
  for (const word of snapshot.words) {
    const part = parts.get(word.partId)!;
    const setId = dautoeicVocabSetId(part.testId);
    const doc = Object.fromEntries(Object.entries(mapWordToDoc(word, part, setId, 0)).filter(([, value]) => value != null)) as unknown as VocabWordDoc;
    if (words.has(doc.id)) throw new Error("Vocabulary word ID collision.");
    words.set(doc.id, doc);
    docsBySet.get(setId)!.push(doc);
    wordsByPart.get(part.id)!.push(word);
  }
  for (const group of partsByTest.values()) group.sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0));
  for (const group of wordsByPart.values()) group.sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0));
  for (const group of docsBySet.values()) group.sort((left, right) =>
    (parts.get(left.externalPartId!)?.orderIndex ?? 0) - (parts.get(right.externalPartId!)?.orderIndex ?? 0) ||
    (left.externalOrderIndex ?? 0) - (right.externalOrderIndex ?? 0));
  return { catalog: snapshot.catalog, sets, words, partsByTest, wordsByPart, docsBySet };
}

let vocabularyIndex: { key: string; promise: Promise<ReturnType<typeof buildVocabularyIndex>> } | undefined;

async function driveVocabularyIndex() {
  const key = contentCacheKey();
  if (vocabularyIndex?.key !== key) {
    const promise = readDriveMaterial<VocabularySnapshot>(`${DAUTOEIC_SOURCE_VERSION}__vocabulary__all`)
      .then((snapshot) => buildVocabularyIndex(vocabularySnapshotSchema.parse(snapshot)));
    vocabularyIndex = { key, promise };
    void promise.catch(() => { if (vocabularyIndex?.promise === promise) vocabularyIndex = undefined; });
  }
  return vocabularyIndex.promise;
}

export async function listDriveVocabSets(): Promise<VocabSetDoc[]> {
  return isDriveContentEnabled() ? [...(await driveVocabularyIndex()).sets.values()] : [];
}

export async function findDriveVocabSet(setId: number): Promise<VocabSetDoc | null> {
  return isDriveContentEnabled() ? (await driveVocabularyIndex()).sets.get(setId) ?? null : null;
}

export async function findDriveVocabWords(setId: number, partId?: string | null): Promise<VocabWordDoc[] | null> {
  if (!isDriveContentEnabled()) return null;
  const index = await driveVocabularyIndex();
  const words = index.docsBySet.get(setId);
  if (!words) return null;
  const selected = partId?.trim();
  if (!selected) return [...words];
  const test = index.sets.get(setId)!;
  if (!index.partsByTest.get(test.externalTestId!)?.some((part) => part.id === selected)) throw NotFound("Không tìm thấy phần từ vựng");
  return words.filter((word) => word.externalPartId === selected);
}

export async function findDriveVocabWordsByIds(wordIds: number[]): Promise<Map<number, VocabWordDoc>> {
  if (!isDriveContentEnabled() || !wordIds.length) return new Map();
  const index = await driveVocabularyIndex();
  return new Map(wordIds.flatMap((id) => { const word = index.words.get(id); return word ? [[id, word] as const] : []; }));
}

export async function getVocabularyCatalogView(
  uid?: string | null,
): Promise<DauToeicVocabCatalogView> {
  if (!isDauToeicVocabConfigured()) return { groups: [], cards: [] };
  const catalog = await getVocabularyCatalog();
  const visibleTests = catalog.tests.filter(isPlayableTest);
  const setNameById = new Map(
    catalog.sets.map((set) => [set.id, cleanName(set.name) || "TOEIC"]),
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
      name: cleanName(set.name) || "TOEIC",
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
      setName: test.setId ? setNameById.get(test.setId) ?? "TOEIC" : "TOEIC",
      title: cleanName(test.name) || "Bộ từ vựng",
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
  const setName = cleanName(set?.name) || "TOEIC";
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

  if (!summaries.length) throw NotFound("Không tìm thấy phần từ vựng");

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
    "TOEIC";
  const allParts = await listVocabularyParts(testId);
  if (!allParts.length) throw NotFound("Không tìm thấy phần từ vựng");

  const selectedParts = partId?.trim()
    ? allParts.filter((part) => part.id === partId.trim())
    : allParts;
  if (!selectedParts.length) throw NotFound("Không tìm thấy phần từ vựng");

  const setId = dautoeicVocabSetId(test.testId);
  const expectedCounts = await wordCountsByPart(selectedParts.map((part) => part.id));
  if (isDriveContentEnabled()) {
    return { setId, test, setName, syncedPartIds: selectedParts.map((part) => part.id),
      wordCount: selectedParts.reduce((total, part) => total + (expectedCounts.get(part.id) ?? 0), 0) };
  }
  const now = Date.now();
  await adminDb.collection(SETS).doc(String(setId)).set(
    {
      id: setId,
      title: cleanName(test.name) || "Bộ từ vựng",
      topic: setName,
      description: "Bộ từ vựng TOEIC từ nguồn server",
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

  // Keep list pages fast: they read this denormalized value instead of issuing
  // one aggregate query per vocabulary set. The sync path is infrequent, so a
  // single reconciliation count here also repairs interrupted/older imports.
  const localCount = await adminDb
    .collection(WORDS)
    .where("setId", "==", setId)
    .where("status", "==", "PUBLISHED")
    .count()
    .get();
  await adminDb.collection(SETS).doc(String(setId)).update({
    wordCount: localCount.data().count,
    updatedAtMillis: Date.now(),
  });

  return {
    setId,
    test,
    setName,
    syncedPartIds: selectedParts.map((part) => part.id),
    wordCount: written,
  };
}

export async function getVocabularyCatalog(): Promise<DauToeicVocabCatalog> {
  if (isDriveContentEnabled()) return (await driveVocabularyIndex()).catalog;
  return cachedVocabularyCatalog();
}

export async function listVocabularyParts(testId: string): Promise<DauToeicVocabPart[]> {
  const cleanTestId = testId.trim();
  if (!cleanTestId) throw new ApiError("testId is required", 400);
  if (isDriveContentEnabled()) return (await driveVocabularyIndex()).partsByTest.get(cleanTestId) ?? [];
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
  if (isDriveContentEnabled()) return (await driveVocabularyIndex()).wordsByPart.get(cleanPartId) ?? [];
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
  if (isDriveContentEnabled()) return (await Promise.all(partIds.map(getWordsForPart))).flat();
  return uncachedWordsForParts(partIds);
}

async function uncachedWordsForParts(partIds: string[]): Promise<DauToeicVocabWord[]> {
  const cleanPartIds = partIds.map((id) => id.trim()).filter(Boolean);
  if (!cleanPartIds.length) return [];
  const rows = await supabasePost("/rest/v1/rpc/get_vocab_words_for_parts_fast", {
    p_part_ids: cleanPartIds,
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(mapWord);
}

export async function fetchVocabularySnapshotFromSource(): Promise<VocabularySnapshot> {
  const catalog = await uncachedVocabularyCatalog();
  catalog.tests = catalog.tests.filter(isPlayableTest);
  const parts: DauToeicVocabPart[] = [];
  for (let offset = 0; offset < catalog.tests.length; offset += 4) {
    parts.push(...(await Promise.all(catalog.tests.slice(offset, offset + 4).map((test) => uncachedVocabularyParts(test.testId)))).flat());
  }
  const words: DauToeicVocabWord[] = [];
  for (let offset = 0; offset < parts.length; offset += 10) {
    words.push(...await uncachedWordsForParts(parts.slice(offset, offset + 10).map((part) => part.id)));
  }
  return vocabularySnapshotSchema.parse({ catalog, parts, words });
}

async function findCatalogTest(testId: string): Promise<DauToeicVocabTest> {
  const cleanTestId = testId.trim();
  if (!cleanTestId) throw new ApiError("testId is required", 400);
  const catalog = await getVocabularyCatalog();
  const test = catalog.tests.find((item) => item.testId === cleanTestId);
  if (!test || !isPlayableTest(test)) throw NotFound("Không tìm thấy bộ từ vựng");
  return test;
}

const cachedVocabularyCatalog = unstable_cache(
  uncachedVocabularyCatalog,
  ["dautoeic-vocab-catalog", DAUTOEIC_SOURCE_VERSION],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

const cachedVocabularyParts = unstable_cache(
  uncachedVocabularyParts,
  ["dautoeic-vocab-parts", DAUTOEIC_SOURCE_VERSION],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

const cachedWordsForPart = unstable_cache(
  uncachedWordsForPart,
  ["dautoeic-vocab-words-for-part", DAUTOEIC_SOURCE_VERSION],
  { revalidate: CATALOG_REVALIDATE_SECONDS },
);

const cachedWordCountEntriesByPart = unstable_cache(
  uncachedWordCountEntriesByPart,
  ["dautoeic-vocab-word-counts-by-part", DAUTOEIC_SOURCE_VERSION],
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
  if (isDriveContentEnabled()) {
    const index = await driveVocabularyIndex();
    return new Map(cleanPartIds.map((id) => [id, index.wordsByPart.get(id)?.length ?? 0]));
  }
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
  const [wordParts, progressSnap] = await Promise.all([
    isDriveContentEnabled()
      ? findDriveVocabWords(setId).then((words) => (words ?? []).map((word) => [word.id, word.externalPartId ?? ""] as const))
      : adminDb.collection(WORDS).where("setId", "==", setId).get().then((snapshot) => snapshot.docs.map((doc) => [numVal(doc.data(), "id") ?? Number(doc.id), text(doc.data(), "externalPartId") ?? ""] as const)),
    adminDb
      .collection("users")
      .doc(uid)
      .collection(PROGRESS)
      .where("setId", "==", setId)
      .get(),
  ]);
  const partByWordId = new Map(wordParts);

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
    // Firestore rejects `undefined`; the external source frequently omits
    // one or both regional IPA values, so store an explicit null instead.
    phoneticUs: parsedIpa.us ?? null,
    phoneticUk: parsedIpa.uk ?? null,
    example: cleanName(firstMeaning.example),
    imageUrl: word.imageUrl,
    exampleTranslation: cleanName(firstMeaning.example_vi),
    phrases: word.phrases,
    synonyms: word.synonyms,
    antonyms: firstMeaning.antonyms ?? [],
    wordFamily: firstMeaning.word_family ?? [],
    toeicTip: cleanName(firstMeaning.toeic_tip),
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
    throw new ApiError("Nguồn từ vựng chưa được cấu hình", 503);
  }
  try {
    const response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        ...dauToeicApiHeaders(anonKey),
        ...(init.headers as Record<string, string> | undefined),
      },
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      throw new ApiError(`Nguồn từ vựng trả lỗi (${response.status})`, 502);
    }
    return response.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Không kết nối được nguồn từ vựng", 502);
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
