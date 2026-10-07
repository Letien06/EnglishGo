import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vocabularyFixture } from "../../test/vocabulary-fixture";
import { serverEnv } from "@/lib/env";

const mocks = vi.hoisted(() => ({
  drive: vi.fn(), driveEnabled: true, key: 0, rows: [] as Record<string, unknown>[],
  collection: vi.fn(), writes: vi.fn(), getAll: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback, revalidateTag: vi.fn() }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => mocks.driveEnabled, contentCacheKey: () => `vocab-${mocks.key}`, readDriveMaterial: mocks.drive }));
vi.mock("./rate-limit", () => ({ enforceDailyActionLimit: vi.fn() }));
vi.mock("./study-activity", async (importOriginal) => ({ ...await importOriginal<typeof import("./study-activity")>(), recordStudyActivity: vi.fn(async () => undefined), getStoredStudyStreakSummary: vi.fn(), getStudyStreak: vi.fn() }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: mocks.collection, getAll: mocks.getAll,
  runTransaction: async (run: (transaction: unknown) => unknown) => run({ get: async () => ({ exists: false, data: () => ({}) }), getAll: async (...refs: unknown[]) => refs.map(() => ({ exists: false, data: () => ({}) })), set: mocks.writes }),
} }));

import * as source from "./dautoeic-vocab";
import * as vocab from "./vocab";

function userQuery(path: string) {
  return {
    path,
    doc: (id: string) => userQuery(`${path}/${id}`),
    collection: (name: string) => userQuery(`${path}/${name}`),
    where: () => userQuery(path), orderBy: () => userQuery(path), limit: () => userQuery(path),
    get: async () => ({ exists: false, data: () => ({}), docs: path.includes("userVocabProgress") ? mocks.rows.map((data) => ({ id: String(data.wordId), data: () => data })) : [] }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.key++;
  mocks.driveEnabled = true;
  mocks.rows = [];
  mocks.drive.mockResolvedValue(vocabularyFixture());
  mocks.collection.mockImplementation((name: string) => {
    if (name !== "users") throw new Error(`Unexpected material collection: ${name}`);
    return userQuery(name);
  });
  mocks.getAll.mockRejectedValue(new Error("Material reads must use Drive"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No live upstream calls during learning"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("vocabulary uses the verified Drive bundle", () => {
  it("opens authorized TOEIC MASTER Pro content with eight vocabulary parts and stable IDs", async () => {
    const snapshot = vocabularyFixture();
    snapshot.accessScope = "provider-authorized";
    snapshot.catalog.sets[0].name = "TOEIC MASTER";
    snapshot.catalog.tests[0] = { ...snapshot.catalog.tests[0], name: "Part 2 Tổng hợp", accessLevel: "pro", partCount: 8, wordCount: 8 };
    snapshot.parts = Array.from({ length: 8 }, (_, index) => ({ id: `master-part-${index + 1}`, testId: "vocab-test", name: `Topic ${index + 1}`, orderIndex: index + 1 }));
    const wordTemplate = snapshot.words[0];
    snapshot.words = snapshot.parts.map((part, index) => ({ ...wordTemplate, id: index === 0 ? "word-lc" : `master-word-${index + 1}`, partId: part.id }));
    mocks.drive.mockResolvedValue(snapshot);

    const catalog = await source.getVocabularyCatalogView();
    expect(catalog.groups).toEqual([{ id: "group", name: "TOEIC MASTER", orderIndex: 1, count: 1 }]);
    expect(catalog.cards[0]).toMatchObject({ id: "vocab-test", accessLevel: "pro", partCount: 8, wordCount: 8, internalSetId: source.dautoeicVocabSetId("vocab-test") });
    const detail = await source.getDautoeicVocabTestView("vocab-test");
    expect(detail.test.accessLevel).toBe("pro");
    expect(detail.parts).toHaveLength(8);
    expect(detail.parts.map((part) => part.wordCount)).toEqual(Array(8).fill(1));
    const synced = await source.syncDautoeicVocabTest("vocab-test", "master-part-1");
    const session = await vocab.getFilteredSessionForPart(synced.setId, null, "master-part-1", "all", "original", "all");
    expect(session.set).toMatchObject({ id: source.dautoeicVocabSetId("vocab-test"), externalTestId: "vocab-test", externalPartId: "master-part-1" });
    expect(session.words[0].id).toBe(source.dautoeicVocabWordId("word-lc"));
    expect(session.totalWords).toBe(1);
    expect(mocks.writes).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains all seven supplied public groups and their tests in a complete Drive snapshot", async () => {
    const template = vocabularyFixture();
    const snapshot = {
      catalog: {
        sets: Array.from({ length: 7 }, (_, index) => ({ id: `group-${index + 1}`, name: `Nhóm ${index + 1}`, orderIndex: index + 1 })),
        tests: Array.from({ length: 7 }, (_, index) => ({ ...template.catalog.tests[0], testId: `test-${index + 1}`, setId: `group-${index + 1}`, name: `Test ${index + 1}` })),
      },
      parts: Array.from({ length: 7 }, (_, index) => template.parts.map((part) => ({ ...part, id: `${part.id}-${index + 1}`, testId: `test-${index + 1}` }))).flat(),
      words: Array.from({ length: 7 }, (_, index) => template.words.map((word) => ({ ...word, id: `${word.id}-${index + 1}`, partId: `${word.partId}-${index + 1}` }))).flat(),
    };
    snapshot.catalog.sets.push({ id: "empty-group", name: "Nhóm rỗng", orderIndex: 8 });
    mocks.drive.mockResolvedValue(snapshot);
    const catalog = await source.getVocabularyCatalogView();
    expect(catalog.groups.map((group) => [group.id, group.count])).toEqual(Array.from({ length: 7 }, (_, index) => [`group-${index + 1}`, 1]));
    expect(catalog.cards.map((card) => card.id)).toEqual(Array.from({ length: 7 }, (_, index) => `test-${index + 1}`));
    expect(catalog.groups.some((group) => group.id === "empty-group")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("filters only PRO and empty tests from source catalogs, without dropping late public groups", async () => {
    mocks.driveEnabled = false;
    vi.spyOn(serverEnv, "dauToeicSupabaseUrl", "get").mockReturnValue("https://source.example");
    vi.spyOn(serverEnv, "dauToeicAnonKey", "get").mockReturnValue("public-test-key");
    const publicTests = Array.from({ length: 7 }, (_, index) => ({ test_id: `test-${index + 1}`, set_id: `group-${index + 1}`, name: `Test ${index + 1}`, part_count: 1, word_count: 10, order_index: index + 1, access_level: index % 2 ? null : "free" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      sets: [...publicTests.map((test, index) => ({ id: test.set_id, name: `Nhóm ${index + 1}`, order_index: index + 1 })), { id: "pro-group", name: "PRO only", order_index: 8 }, { id: "empty-group", name: "Empty", order_index: 9 }],
      tests: [...publicTests, { ...publicTests[0], test_id: "pro-test", set_id: "pro-group", access_level: " Pro " }, { ...publicTests[0], test_id: "no-words", set_id: "empty-group", word_count: 0 }, { ...publicTests[0], test_id: "no-parts", set_id: "empty-group", part_count: 0 }],
    }), { status: 200 })));
    const catalog = await source.getVocabularyCatalogView();
    expect(catalog.groups).toHaveLength(7);
    expect(catalog.cards.map((card) => card.id)).toEqual(publicTests.map((test) => test.test_id));
    expect(catalog.groups.some((group) => group.id === "pro-group" || group.id === "empty-group")).toBe(false);
    await expect(source.getDautoeicVocabTestView("pro-test")).rejects.toMatchObject({ status: 404 });
    expect(mocks.drive).not.toHaveBeenCalled();
    expect(mocks.collection).not.toHaveBeenCalled();
  });

  it("passes stored phrases, translations and tips to the client without upstream reads", async () => {
    const snapshot = vocabularyFixture();
    snapshot.words[0].phrases = [{ phrase: "at the office", meaning: "ở văn phòng" }];
    snapshot.words[0].synonyms = ["workplace"];
    snapshot.words[0].meanings[0] = { ...snapshot.words[0].meanings[0], example_vi: "Ví dụ.", toeic_tip: "Part 1", antonyms: ["home"], word_family: ["officer"] };
    mocks.drive.mockResolvedValue(snapshot);
    const session = await vocab.getFilteredSessionForPart(source.dautoeicVocabSetId("vocab-test"), null, "lc", "all", "original", "all", false);
    expect(session.words[0]).toMatchObject({ phrases: [{ text: "at the office", meaning: "ở văn phòng" }], synonyms: ["workplace"], exampleTranslation: "Ví dụ.", toeicTip: "Part 1", antonyms: ["home"], wordFamily: ["officer"] });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("opens catalogs, test parts and sessions with no Firestore or upstream calls", async () => {
    const catalog = await source.getVocabularyCatalogView();
    expect(catalog.cards[0]).toMatchObject({ id: "vocab-test", wordCount: 2 });
    const view = await source.getDautoeicVocabTestView("vocab-test");
    expect(view.parts.map((part) => [part.name, part.wordCount])).toEqual([["LC", 1], ["RC", 1]]);
    const sync = await source.syncDautoeicVocabTest("vocab-test", "lc");
    const session = await vocab.getFilteredSessionForPart(sync.setId, null, "lc", "all", "original", "all");
    expect(session.words).toHaveLength(1);
    expect(session.words[0]).toMatchObject({ id: source.dautoeicVocabWordId("word-lc"), word: "office", audioUrl: "https://example.com/audio.mp3" });
    expect(mocks.drive).toHaveBeenCalledTimes(1);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves existing IDs, mastery and part filtering without reading stored word documents", async () => {
    const setId = source.dautoeicVocabSetId("vocab-test");
    const wordId = source.dautoeicVocabWordId("word-lc");
    mocks.rows = [{ wordId, setId, status: "MASTERED", nextReviewAtMillis: 1, interval: 30, easeFactor: 2.5, repetitions: 3 }];
    const view = await source.getDautoeicVocabTestView("vocab-test", "learner");
    expect(view.parts[0]).toMatchObject({ masteredWords: 1, dueWords: 1 });
    expect(view.parts[1].masteredWords).toBe(0);
    const session = await vocab.getFilteredSessionForPart(setId, "learner", "lc", "mastered", "original", "all");
    expect(session.words[0]).toMatchObject({ id: wordId, mastered: true });
    expect((await vocab.getReviewSession("learner", 20)).words[0].id).toBe(wordId);
    expect((await vocab.findProgressSetCards("learner"))[0]).toMatchObject({ id: setId, totalWords: 2, masteredWords: 1 });
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it("saves reviews for words that have never been imported into Firestore", async () => {
    const wordId = source.dautoeicVocabWordId("word-lc");
    await expect(vocab.reviewBatch("learner", [{ wordId, mastered: true }])).resolves.toMatchObject([{ wordId, newStatus: "MASTERED" }]);
    expect(mocks.writes).toHaveBeenCalledWith(expect.objectContaining({ path: `users/learner/userVocabProgress/${wordId}` }), expect.objectContaining({ wordId, setId: source.dautoeicVocabSetId("vocab-test"), status: "MASTERED" }), { merge: true });
    await expect(vocab.review("learner", wordId, 4)).resolves.toMatchObject({ wordId });
    await expect(vocab.markMastered("learner", wordId)).resolves.toMatchObject({ newStatus: "MASTERED" });
    const { recordStudyActivity } = await import("./study-activity");
    expect(recordStudyActivity).toHaveBeenCalledWith("learner", expect.objectContaining({ activityType: "vocab_review", metric: "vocab", quantity: 1 }));
    expect(recordStudyActivity).toHaveBeenCalledWith("learner", expect.objectContaining({ activityType: "vocab_mastered", metric: "vocab", quantity: 1 }));
    expect(mocks.getAll).not.toHaveBeenCalled();
  });

  it("can load a game without waiting for history and still validates unknown word IDs", async () => {
    const collections: string[] = [];
    mocks.collection.mockImplementation((name: string) => ({
      doc: (uid: string) => ({ collection: (collection: string) => {
        collections.push(collection);
        if (collection === "vocabStudyHistory") throw new Error("History must load separately");
        return userQuery(`${name}/${uid}/${collection}`);
      } }),
    }));
    const session = await vocab.getFilteredSessionForPart(source.dautoeicVocabSetId("vocab-test"), "learner", "lc", "all", "original", "all", false);
    expect(session.words).toHaveLength(1);
    expect(collections).toEqual(["userVocabProgress"]);
    mocks.collection.mockImplementation((name: string) => userQuery(name));
    mocks.getAll.mockResolvedValue([{ exists: false }]);
    await expect(vocab.reviewBatch("learner", [{ wordId: 42, mastered: true }])).rejects.toMatchObject({ status: 404 });
    expect(mocks.writes).not.toHaveBeenCalled();
  });

  it("rejects invalid parts and corrupt or missing snapshots instead of silently using the upstream", async () => {
    await expect(source.syncDautoeicVocabTest("vocab-test", "wrong-part")).rejects.toMatchObject({ status: 404 });
    await expect(source.findDriveVocabWords(source.dautoeicVocabSetId("vocab-test"), "wrong-part")).rejects.toMatchObject({ status: 404 });
    mocks.key++;
    // A single transient chunk failure is retried and then succeeds.
    mocks.drive.mockRejectedValueOnce(new Error("Transient chunk failure"));
    await expect(source.getVocabularyCatalog()).resolves.toMatchObject({ tests: [{ testId: "vocab-test" }] });
    // A persistently missing snapshot still surfaces the error instead of
    // silently falling back to the upstream.
    mocks.key++;
    mocks.drive.mockRejectedValue(new Error("Missing snapshot"));
    await expect(source.getVocabularyCatalog()).rejects.toThrow("Missing snapshot");
    mocks.drive.mockResolvedValue(vocabularyFixture());
    await expect(source.getVocabularyCatalog()).resolves.toMatchObject({ tests: [{ testId: "vocab-test" }] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
