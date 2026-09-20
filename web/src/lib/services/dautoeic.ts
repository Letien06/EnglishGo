/**
 * DauToeic external Supabase API client.
 *
 * Ported from `service/DauToeicClientService.java`.
 *
 * This calls an external Supabase instance (NOT our Firestore) to fetch
 * TOEIC practice content: questions, passages, difficulty levels, etc.
 */
import { unstable_cache } from "next/cache";
import { serverEnv } from "../env";
import { ApiError } from "../api/response";
import type {
  DauToeicDifficultyLevel,
  DauToeicDifficultySession,
  DauToeicPracticeItem,
  DauToeicQuestion,
  DauToeicPassage,
  DauToeicSet,
  DauToeicTest,
  PracticeStat,
} from "../../types/dautoeic";
import {
  mirrorKey,
  readMirrorJson,
  readMirrorSession,
  writeMirrorJson,
  writeMirrorSession,
} from "./dautoeic-mirror";
import {
  readCanonicalPart,
  readCanonicalSets,
  readCanonicalTestByRouteId,
  readCanonicalTests,
  writeCanonicalPart,
  writeCanonicalSets,
  writeCanonicalTest,
  writeCanonicalTests,
} from "./dautoeic-canonical";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function listDifficultyLevels(part: number): Promise<DauToeicDifficultyLevel[]> {
  requireListeningPart(part);
  const key = mirrorKey("listening", "levels", part);
  return mirrorJsonFirst(key, () => cachedListeningDifficultyLevels(part), "difficulty-levels");
}

export async function listSets(): Promise<DauToeicSet[]> {
  const canonical = await readCanonicalSets().catch(() => []);
  if (canonical.length > 0) return canonical;
  const key = mirrorKey("sets", "all");
  const sets = await mirrorJsonFirst(key, () => cachedListSets(), "sets");
  await writeCanonicalSets(sets).catch(() => undefined);
  return sets;
}

export async function listTests(setId?: string | null): Promise<DauToeicTest[]> {
  const cleanSetId = setId?.trim() || null;
  const canonical = await readCanonicalTests(cleanSetId).catch(() => []);
  if (canonical.length > 0) return canonical;
  const key = mirrorKey("tests", cleanSetId);
  const tests = await mirrorJsonFirst(key, () => cachedListTests(cleanSetId), "tests");
  await writeCanonicalTests(tests, { markComplete: cleanSetId == null }).catch(() => undefined);
  return tests;
}

async function uncachedListSets(): Promise<DauToeicSet[]> {
  const rows = await supabaseGet("/rest/v1/mock_test_sets", {
    select: "id,name,description,order_index",
    is_hidden: "eq.false",
    order: "order_index.asc",
  });
  if (!Array.isArray(rows)) return [];
  return rows.map((row: Record<string, unknown>) => ({
    id: text(row, "id") ?? "",
    name: text(row, "name"),
    description: text(row, "description"),
    orderIndex: integer(row, "order_index"),
  }));
}

async function uncachedListTests(setId?: string | null): Promise<DauToeicTest[]> {
  const params: Record<string, string> = {
    select: "*,mock_test_sets(name)",
    is_hidden: "eq.false",
    order: "order_index.asc",
  };
  if (setId?.trim()) {
    params.set_id = `eq.${setId.trim()}`;
  }
  const rows = await supabaseGet("/rest/v1/mock_tests", params);
  if (!Array.isArray(rows)) return [];
  return rows.map((row: Record<string, unknown>) => mapTest(row));
}

export async function getTest(testId: string): Promise<DauToeicTest> {
  if (!testId.trim()) {
    throw new ApiError("testId is required", 400);
  }
  const cleanTestId = testId.trim();
  const canonical = await readCanonicalTestByRouteId(routeTestId(cleanTestId)).catch(() => null);
  if (canonical) return canonical;
  const key = mirrorKey("test", cleanTestId);
  const test = await mirrorJsonFirst(key, () => cachedGetTest(cleanTestId), "test");
  await writeCanonicalTest(test).catch(() => undefined);
  return test;
}

async function uncachedGetTest(testId: string): Promise<DauToeicTest> {
  const rows = await supabaseGet("/rest/v1/mock_tests", {
    select: "*,mock_test_sets(name)",
    id: `eq.${testId}`,
    limit: "1",
  });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError("Dau TOEIC test not found", 404);
  }
  return mapTest(rows[0] as Record<string, unknown>);
}

export async function getPart(testId: string, part: number): Promise<{
  test: DauToeicTest;
  part: number;
  skill: "listening" | "reading";
  passages: DauToeicPassage[];
  questions: DauToeicQuestion[];
}> {
  if (part < 1 || part > 7) {
    throw new ApiError("TOEIC part must be between 1 and 7", 400);
  }
  const cleanTestId = testId.trim();
  const canonical = await readCanonicalPart(routeTestId(cleanTestId), part).catch(() => null);
  if (canonical) return canonical;
  const key = mirrorKey("test-part", cleanTestId, part);
  const partContent = await mirrorJsonFirst(key, () => cachedGetPart(cleanTestId, part), "test-part");
  await writeCanonicalPart(partContent).catch(() => undefined);
  return partContent;
}

async function uncachedGetPart(testId: string, part: number) {
  const test = await cachedGetTest(testId);
  const [passages, questions] = await Promise.all([
    cachedPassagesForTestPart(test, part),
    cachedQuestionsForTestPart(test, part),
  ]);
  return { test, part, skill: part <= 4 ? "listening" as const : "reading" as const, passages, questions };
}

export function routeTestId(externalId: string): number {
  return stableId(externalId);
}

export function routeQuestionId(externalId: string): number {
  return stableId(externalId);
}

export function optionId(questionId: number, letter: string): number {
  const suffix = letter === "A" ? 1 : letter === "B" ? 2 : letter === "C" ? 3 : letter === "D" ? 4 : 0;
  return questionId * 10 + suffix;
}

export function optionLetter(id: number | null | undefined): string | null {
  if (id == null) return null;
  switch (Math.abs(Math.trunc(id)) % 10) {
    case 1: return "A";
    case 2: return "B";
    case 3: return "C";
    case 4: return "D";
    default: return null;
  }
}

export async function listReadingDifficultyLevels(part: number): Promise<DauToeicDifficultyLevel[]> {
  requireReadingPart(part);
  const key = mirrorKey("reading", "levels", part);
  return mirrorJsonFirst(key, () => cachedReadingDifficultyLevels(part), "difficulty-levels");
}

export async function getDifficultySession(
  part: number,
  level: number,
  limit?: number | null,
): Promise<DauToeicDifficultySession> {
  requireListeningPart(part);
  const cleanLimit = normalizeLimit(limit);
  const key = mirrorKey("listening", "session", part, level, cleanLimit);
  return mirrorSessionFirst(key, () => cachedListeningDifficultySession(part, level, cleanLimit));
}

export async function getReadingDifficultySession(
  part: number,
  level: number,
  limit?: number | null,
): Promise<DauToeicDifficultySession> {
  requireReadingPart(part);
  const cleanLimit = normalizeLimit(limit);
  const key = mirrorKey("reading", "session", part, level, cleanLimit);
  return mirrorSessionFirst(key, () => cachedReadingDifficultySession(part, level, cleanLimit));
}

export async function fetchSetsFromSource(): Promise<DauToeicSet[]> {
  return uncachedListSets();
}

export async function fetchListTestsFromSource(setId?: string | null): Promise<DauToeicTest[]> {
  return uncachedListTests(setId?.trim() || null);
}

export async function fetchTestFromSource(testId: string): Promise<DauToeicTest> {
  return uncachedGetTest(testId.trim());
}

export async function fetchPartFromSource(testId: string, part: number) {
  return uncachedGetPart(testId.trim(), part);
}

export async function fetchListeningDifficultyLevelsFromSource(part: number) {
  requireListeningPart(part);
  return difficultyLevels(part, await uncachedPracticeStats(part));
}

export async function fetchReadingDifficultyLevelsFromSource(part: number) {
  requireReadingPart(part);
  return difficultyLevels(part, await uncachedPracticeStats(part));
}

export async function fetchListeningDifficultySessionFromSource(
  part: number,
  level: number,
  limit?: number | null,
) {
  requireListeningPart(part);
  return difficultySession(part, level, normalizeLimit(limit), uncachedPracticeStats);
}

export async function fetchReadingDifficultySessionFromSource(
  part: number,
  level: number,
  limit?: number | null,
) {
  requireReadingPart(part);
  return difficultySession(part, level, normalizeLimit(limit), uncachedPracticeStats);
}

const cachedListSets = unstable_cache(
  uncachedListSets,
  ["dautoeic-sets"],
  { revalidate: 600 },
);

const cachedListTests = unstable_cache(
  uncachedListTests,
  ["dautoeic-tests"],
  { revalidate: 600 },
);

const cachedGetTest = unstable_cache(
  uncachedGetTest,
  ["dautoeic-test"],
  { revalidate: 600 },
);

const cachedGetPart = unstable_cache(
  uncachedGetPart,
  ["dautoeic-part"],
  { revalidate: 600 },
);

const cachedListeningDifficultyLevels = unstable_cache(
  async (part: number) => difficultyLevels(part, await cachedPracticeStats(part)),
  ["dautoeic-difficulty-levels"],
  { revalidate: 600 },
);

const cachedReadingDifficultyLevels = unstable_cache(
  async (part: number) => difficultyLevels(part, await cachedPracticeStats(part)),
  ["dautoeic-reading-difficulty-levels"],
  { revalidate: 600 },
);

const cachedListeningDifficultySession = unstable_cache(
  async (part: number, level: number, limit: number | null) => difficultySession(part, level, limit),
  // Bump the cache namespace so deployments do not keep a previously
  // generated empty session after the source data has been repaired.
  ["dautoeic-difficulty-session-v2"],
  { revalidate: 600 },
);

const cachedReadingDifficultySession = unstable_cache(
  async (part: number, level: number, limit: number | null) => difficultySession(part, level, limit),
  ["dautoeic-reading-difficulty-session-v2"],
  { revalidate: 600 },
);

const cachedPracticeStats = unstable_cache(
  uncachedPracticeStats,
  ["dautoeic-practice-stats"],
  { revalidate: 600 },
);

/* ------------------------------------------------------------------ */
/*  Difficulty levels                                                  */
/* ------------------------------------------------------------------ */

function difficultyLevels(
  part: number,
  stats: PracticeStat[],
): DauToeicDifficultyLevel[] {
  const byLevel = new Map<number, PracticeStat[]>();
  for (let l = 1; l <= 5; l++) byLevel.set(l, []);

  for (const stat of stats) {
    if ((stat.part == null || stat.part === part) && stat.level != null && byLevel.has(stat.level)) {
      byLevel.get(stat.level)!.push(stat);
    }
  }

  const levels: DauToeicDifficultyLevel[] = [];
  for (const [level, levelStats] of byLevel) {
    const total = levelStats.length;
    const totalAttempts = levelStats.reduce(
      (sum, s) => sum + (s.totalAttempts ?? 0),
      0,
    );
    const wrongAttempts = levelStats.reduce(
      (sum, s) => sum + (s.wrongCount ?? 0),
      0,
    );
    const errorRates = levelStats
      .map((s) => s.errorRate)
      .filter((r): r is number => r != null);
    const min = errorRates.length > 0 ? Math.min(...errorRates) : defaultErrorMin(level);
    const max = errorRates.length > 0 ? Math.max(...errorRates) : defaultErrorMax(level);

    levels.push({
      part,
      level,
      title: levelTitle(level),
      errorRateMin: min,
      errorRateMax: max,
      total,
      done: 0,
      correct: 0,
      wrong: 0,
      remaining: total,
      totalAttempts,
      wrongAttempts,
    });
  }
  return levels;
}

/* ------------------------------------------------------------------ */
/*  Difficulty session                                                 */
/* ------------------------------------------------------------------ */

async function difficultySession(
  part: number,
  level: number,
  limit?: number | null,
  statsLoader: (part: number) => Promise<PracticeStat[]> = cachedPracticeStats,
): Promise<DauToeicDifficultySession> {
  if (level < 1 || level > 5) {
    throw new ApiError("Difficulty level must be between 1 and 5");
  }
  const effectiveLimit = limit && limit > 0 ? limit : Infinity;
  const allStats = await statsLoader(part);
  const levelStats = allStats
    // Keep the part constraint here as a defensive guard. The RPC normally
    // applies `p_part`, but older deployments returned a broader stats set;
    // mixing those IDs made the resulting session appear empty after question
    // lookup and triggered the dashboard redirect.
    .filter((s) => (s.part == null || s.part === part) && s.level === level)
    .slice(0, effectiveLimit);

  const items =
    part <= 2 || part === 5
      ? await questionPracticeItems(levelStats, part, level)
      : await passagePracticeItems(levelStats, part, level);

  return {
    part,
    level,
    title: levelTitle(level),
    total: levelStats.length,
    items,
  };
}

/* ------------------------------------------------------------------ */
/*  Practice items (question-based: parts 1, 2, 5)                    */
/* ------------------------------------------------------------------ */

async function questionPracticeItems(
  stats: PracticeStat[],
  part: number,
  level: number,
): Promise<DauToeicPracticeItem[]> {
  const statsById = new Map<string, PracticeStat>();
  for (const stat of stats) statsById.set(stat.itemId, stat);

  const questions = await questionsByIds([...statsById.keys()]);
  const questionsById = new Map<string, DauToeicQuestion>();
  for (const q of questions) questionsById.set(q.id, q);

  const items: DauToeicPracticeItem[] = [];
  for (const stat of stats) {
    const question = questionsById.get(stat.itemId);
    if (!question) continue;
    items.push({
      id: question.id,
      itemType: stat.itemType,
      part,
      level,
      errorRate: stat.errorRate,
      totalAttempts: stat.totalAttempts,
      wrongCount: stat.wrongCount,
      audioUrl: question.audioUrl,
      imageUrl: question.imageUrl,
      transcript: plainText(firstText(question.passageText, question.questionText)),
      translation: question.translationVi,
      vocabulary: question.vocabulary,
      questions: [question],
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/*  Practice items (passage-based: parts 3, 4, 6, 7)                  */
/* ------------------------------------------------------------------ */

async function passagePracticeItems(
  stats: PracticeStat[],
  part: number,
  level: number,
): Promise<DauToeicPracticeItem[]> {
  const statsById = new Map<string, PracticeStat>();
  for (const stat of stats) statsById.set(stat.itemId, stat);

  const passages = await passagesByIds([...statsById.keys()]);
  const passagesById = new Map<string, DauToeicPassage>();
  for (const p of passages) passagesById.set(p.id, p);

  const questionsByPassageId = await fetchQuestionsByPassageIds([...statsById.keys()]);

  const items: DauToeicPracticeItem[] = [];
  for (const stat of stats) {
    const passage = passagesById.get(stat.itemId);
    if (!passage) continue;
    const questions = questionsByPassageId.get(passage.id) ?? [];
    const passageText = plainText(
      combinedText(passage.transcript, passage.passageText, passage.passageText2, passage.passageText3),
    );
    items.push({
      id: passage.id,
      itemType: stat.itemType,
      part,
      level,
      errorRate: stat.errorRate,
      totalAttempts: stat.totalAttempts,
      wrongCount: stat.wrongCount,
      audioUrl: passage.audioUrl,
      imageUrl: passage.imageUrl,
      transcript: passageText,
      translation: plainText(firstQuestionText(questions, (q) => q.translationVi)),
      vocabulary: firstQuestionText(questions, (q) => q.vocabulary),
      questions,
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/*  Supabase RPC: practice stats                                       */
/* ------------------------------------------------------------------ */

async function uncachedPracticeStats(part: number): Promise<PracticeStat[]> {
  const rows = await supabasePost("/rest/v1/rpc/get_practice_stats", {
    p_part: part,
  });
  if (!Array.isArray(rows)) return [];
  return rows.map(
    (row: Record<string, unknown>): PracticeStat => ({
      itemId: text(row, "item_id") ?? "",
      itemType: text(row, "item_type"),
      part: integer(row, "part"),
      level: integer(row, "difficulty_level"),
      totalAttempts: integer(row, "total_attempts"),
      wrongCount: integer(row, "wrong_count"),
      errorRate: decimal(row, "error_rate"),
    }),
  );
}

/* ------------------------------------------------------------------ */
/*  Supabase REST: questions                                           */
/* ------------------------------------------------------------------ */

async function questionsByIds(ids: string[]): Promise<DauToeicQuestion[]> {
  if (ids.length === 0) return [];
  const rows = await supabaseGet("/rest/v1/mock_test_questions", {
    select: "*",
    id: `in.(${ids.join(",")})`,
  });
  if (!Array.isArray(rows)) return [];
  const tests = await testsById(rows);
  return rows.map((row: Record<string, unknown>) => mapQuestion(row, tests));
}

async function fetchQuestionsByPassageIds(
  passageIds: string[],
): Promise<Map<string, DauToeicQuestion[]>> {
  if (passageIds.length === 0) return new Map();
  const rows = await supabaseGet("/rest/v1/mock_test_questions", {
    select: "*",
    passage_id: `in.(${passageIds.join(",")})`,
    order: "question_number.asc",
  });
  if (!Array.isArray(rows)) return new Map();
  const tests = await testsById(rows);
  const result = new Map<string, DauToeicQuestion[]>();
  for (const row of rows) {
    const q = mapQuestion(row as Record<string, unknown>, tests);
    if (q.passageId) {
      if (!result.has(q.passageId)) result.set(q.passageId, []);
      result.get(q.passageId)!.push(q);
    }
  }
  return result;
}

async function mirrorJsonFirst<T>(
  key: string,
  fetcher: () => Promise<T>,
  kind: string,
): Promise<T> {
  const mirrored = await readMirrorJson<T>(key).catch(() => null);
  if (mirrored) return mirrored;
  const fresh = await fetcher();
  await writeMirrorJson(key, kind, fresh).catch(() => undefined);
  return fresh;
}

async function mirrorSessionFirst(
  key: string,
  fetcher: () => Promise<DauToeicDifficultySession>,
): Promise<DauToeicDifficultySession> {
  const mirrored = await readMirrorSession(key).catch(() => null);
  // A mirror document can outlive its source data and contain only an empty
  // session (for example when a sync ran while the upstream API was
  // temporarily unavailable). Treat that as a cache miss so the learner does
  // not get silently redirected back to the dashboard.
  if (mirrored && mirrored.items.length > 0) return mirrored;
  const fresh = await fetcher();
  await writeMirrorSession(key, fresh).catch(() => undefined);
  return fresh;
}

async function questionsForTestPart(
  test: DauToeicTest,
  part: number,
): Promise<DauToeicQuestion[]> {
  const rows = await supabaseGet("/rest/v1/mock_test_questions", {
    select: "*",
    test_id: `eq.${test.id}`,
    part: `eq.${part}`,
    order: "question_number.asc",
  });
  if (!Array.isArray(rows)) return [];
  return rows.map((row: Record<string, unknown>) =>
    mapQuestion(row, new Map([[test.id, test]])),
  );
}

const cachedQuestionsForTestPart = unstable_cache(
  questionsForTestPart,
  ["dautoeic-test-part-questions"],
  { revalidate: 600 },
);

async function passagesForTestPart(
  test: DauToeicTest,
  part: number,
): Promise<DauToeicPassage[]> {
  const rows = await supabaseGet("/rest/v1/mock_test_passages", {
    select: "*",
    test_id: `eq.${test.id}`,
    part: `eq.${part}`,
    order: "order_index.asc",
  });
  if (!Array.isArray(rows)) return [];
  return rows.map((row: Record<string, unknown>) =>
    mapPassage(row, new Map([[test.id, test]])),
  );
}

const cachedPassagesForTestPart = unstable_cache(
  passagesForTestPart,
  ["dautoeic-test-part-passages"],
  { revalidate: 600 },
);

/* ------------------------------------------------------------------ */
/*  Supabase REST: passages                                            */
/* ------------------------------------------------------------------ */

async function passagesByIds(ids: string[]): Promise<DauToeicPassage[]> {
  if (ids.length === 0) return [];
  const rows = await supabaseGet("/rest/v1/mock_test_passages", {
    select: "*",
    id: `in.(${ids.join(",")})`,
  });
  if (!Array.isArray(rows)) return [];
  const tests = await testsById(rows);
  return rows.map((row: Record<string, unknown>) => mapPassage(row, tests));
}

/* ------------------------------------------------------------------ */
/*  Supabase REST: tests by ID (batch lookup)                          */
/* ------------------------------------------------------------------ */

async function testsById(
  rows: Record<string, unknown>[],
): Promise<Map<string, DauToeicTest>> {
  const testIds = [...new Set(rows.map((r) => text(r, "test_id")).filter(Boolean))] as string[];
  if (testIds.length === 0) return new Map();
  const testRows = await supabaseGet("/rest/v1/mock_tests", {
    select: "*,mock_test_sets(name)",
    id: `in.(${testIds.join(",")})`,
  });
  if (!Array.isArray(testRows)) return new Map();
  const map = new Map<string, DauToeicTest>();
  for (const row of testRows) {
    const t = mapTest(row as Record<string, unknown>);
    map.set(t.id, t);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/*  Row mappers                                                        */
/* ------------------------------------------------------------------ */

function mapQuestion(
  row: Record<string, unknown>,
  tests: Map<string, DauToeicTest>,
): DauToeicQuestion {
  const test = tests.get(text(row, "test_id") ?? "");
  const mediaFolder = test?.mediaFolder ?? null;
  return {
    id: text(row, "id") ?? "",
    testId: text(row, "test_id"),
    passageId: text(row, "passage_id"),
    part: integer(row, "part"),
    section: text(row, "section"),
    questionNumber: integer(row, "question_number"),
    audioUrl: mediaUrl(mediaFolder, text(row, "audio_url")),
    imageUrl: mediaUrl(mediaFolder, text(row, "image_url")),
    passageText: text(row, "passage_text"),
    questionText: text(row, "question_text"),
    optionA: text(row, "option_a"),
    optionB: text(row, "option_b"),
    optionC: text(row, "option_c"),
    optionD: text(row, "option_d"),
    correctAnswer: text(row, "correct_answer"),
    explanationVi: text(row, "explanation_vi"),
    explanationEn: text(row, "explanation_en"),
    difficultyLevel: integer(row, "difficulty_level"),
    orderIndex: integer(row, "order_index"),
    translationVi: text(row, "dich_nghia"),
    vocabulary: text(row, "tu_vung"),
    answerTranslationVi: text(row, "dich_nghia_dap_an"),
  };
}

function mapPassage(
  row: Record<string, unknown>,
  tests: Map<string, DauToeicTest>,
): DauToeicPassage {
  const test = tests.get(text(row, "test_id") ?? "");
  const mediaFolder = test?.mediaFolder ?? null;
  return {
    id: text(row, "id") as string,
    testId: text(row, "test_id"),
    part: integer(row, "part"),
    passageType: text(row, "passage_type"),
    audioUrl: mediaUrl(mediaFolder, text(row, "audio_url")),
    imageUrl: mediaUrl(mediaFolder, text(row, "image_url")),
    passageText: text(row, "passage_text"),
    passageText2: text(row, "passage_text_2"),
    passageText3: text(row, "passage_text_3"),
    transcript: text(row, "transcript"),
    orderIndex: integer(row, "order_index"),
    title: text(row, "title"),
  };
}

function mapTest(row: Record<string, unknown>): DauToeicTest {
  const setsObj = row["mock_test_sets"] as Record<string, unknown> | null;
  return {
    id: text(row, "id") ?? "",
    setId: text(row, "set_id"),
    setName: setsObj ? text(setsObj, "name") : null,
    name: text(row, "name"),
    description: text(row, "description"),
    source: text(row, "source"),
    year: integer(row, "year"),
    difficultyLevel: integer(row, "difficulty_level"),
    totalQuestions: integer(row, "total_questions"),
    listeningDurationSeconds: integer(row, "listening_duration_seconds"),
    readingDurationSeconds: integer(row, "reading_duration_seconds"),
    isFree: bool(row, "is_free"),
    isHidden: bool(row, "is_hidden"),
    orderIndex: integer(row, "order_index"),
    mediaFolder: text(row, "media_folder"),
    mediaVersion: integer(row, "media_version"),
  };
}

/* ------------------------------------------------------------------ */
/*  Supabase HTTP helpers                                              */
/* ------------------------------------------------------------------ */

async function supabaseGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(path, serverEnv.dauToeicSupabaseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
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
    throw new ApiError("DauToeic API is not configured", 400);
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
      next: { revalidate: 300 }, // cache for 5 minutes
    });
    if (!response.ok) {
      throw new ApiError(`DauToeic API error (${response.status})`, 502);
    }
    return await response.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Cannot connect to DauToeic API", 502);
  }
}

/* ------------------------------------------------------------------ */
/*  Media URL builder                                                  */
/* ------------------------------------------------------------------ */

function mediaUrl(mediaFolder: string | null, fileName: string | null): string | null {
  if (!fileName?.trim()) return null;
  const clean = fileName.trim();
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
  if (!mediaFolder?.trim()) return clean;

  const path = `${stripSlashes(mediaFolder)}/${stripSlashes(clean)}`;
  const encoded = path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const base = serverEnv.dauToeicMediaBaseUrl.replace(/\/+$/, "");
  return `${base}/${encoded}`;
}

function stripSlashes(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

function requireListeningPart(part: number): void {
  if (part < 1 || part > 4) {
    throw new ApiError("Listening part must be between 1 and 4");
  }
}

function requireReadingPart(part: number): void {
  if (part < 5 || part > 7) {
    throw new ApiError("Reading part must be between 5 and 7");
  }
}

/* ------------------------------------------------------------------ */
/*  Level metadata                                                     */
/* ------------------------------------------------------------------ */

function levelTitle(level: number): string {
  switch (level) {
    case 1: return "Level 1 — Dễ";
    case 2: return "Level 2 — Cơ bản";
    case 3: return "Level 3 — Trung bình";
    case 4: return "Level 4 — Khó";
    case 5: return "Level 5 — Rất khó";
    default: return `Level ${level}`;
  }
}

function defaultErrorMin(level: number): number {
  switch (level) {
    case 1: return 0.01;
    case 2: return 0.14;
    case 3: return 0.23;
    case 4: return 0.32;
    case 5: return 0.43;
    default: return 0.0;
  }
}

function defaultErrorMax(level: number): number {
  switch (level) {
    case 1: return 0.14;
    case 2: return 0.23;
    case 3: return 0.32;
    case 4: return 0.43;
    case 5: return 0.85;
    default: return 1.0;
  }
}

/* ------------------------------------------------------------------ */
/*  Text helpers                                                       */
/* ------------------------------------------------------------------ */

function firstText(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    if (v?.trim()) return v;
  }
  return null;
}

function firstQuestionText(
  questions: DauToeicQuestion[],
  extractor: (q: DauToeicQuestion) => string | null,
): string | null {
  for (const q of questions) {
    const v = extractor(q);
    if (v?.trim()) return v;
  }
  return null;
}

function combinedText(...values: (string | null | undefined)[]): string | null {
  const parts: string[] = [];
  for (const v of values) {
    const cleaned = plainText(v);
    if (cleaned && !parts.includes(cleaned)) parts.push(cleaned);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function plainText(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const withBreaks = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, "");
  // Decode HTML entities
  const decoded = withoutTags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return decoded
    .replace(/[ \t\x0B\f\r]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  JSON field extractors                                              */
/* ------------------------------------------------------------------ */

function text(obj: Record<string, unknown>, field: string): string | null {
  const v = obj[field];
  if (v == null) return null;
  const s = String(v);
  return s.trim() || null;
}

function integer(obj: Record<string, unknown>, field: string): number | null {
  const v = obj[field];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function decimal(obj: Record<string, unknown>, field: string): number | null {
  const v = obj[field];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(obj: Record<string, unknown>, field: string): boolean | null {
  const v = obj[field];
  if (typeof v === "boolean") return v;
  return null;
}

function normalizeLimit(limit?: number | null): number | null {
  return limit && limit > 0 ? limit : null;
}

function stableId(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ApiError("External id is required", 400);
  }
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
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
