import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vocabularyFixture } from "../../test/vocabulary-fixture";

const mocks = vi.hoisted(() => ({
  drive: vi.fn(), key: 0, rows: [] as Record<string, unknown>[],
  collection: vi.fn(), writes: vi.fn(), getAll: vi.fn(),
}));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => true, contentCacheKey: () => `vocab-${mocks.key}`, readDriveMaterial: mocks.drive }));
vi.mock("./rate-limit", () => ({ enforceDailyActionLimit: vi.fn() }));
vi.mock("./study-activity", () => ({ recordStudyActivity: vi.fn(async () => undefined), getStoredStudyStreakSummary: vi.fn(), getStudyStreak: vi.fn() }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: mocks.collection, getAll: mocks.getAll,
  runTransaction: async (run: (transaction: unknown) => unknown) => run({ get: async () => ({ exists: false, data: () => ({}) }), set: mocks.writes }),
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
  mocks.rows = [];
  mocks.drive.mockResolvedValue(vocabularyFixture());
  mocks.collection.mockImplementation((name: string) => {
    if (name !== "users") throw new Error(`Unexpected material collection: ${name}`);
    return userQuery(name);
  });
  mocks.getAll.mockRejectedValue(new Error("Material reads must use Drive"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No live upstream calls during learning"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("vocabulary uses the verified Drive bundle", () => {
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
    mocks.drive.mockRejectedValueOnce(new Error("Missing snapshot"));
    await expect(source.getVocabularyCatalog()).rejects.toThrow("Missing snapshot");
    await expect(source.getVocabularyCatalog()).resolves.toMatchObject({ tests: [{ testId: "vocab-test" }] });
    expect(fetch).not.toHaveBeenCalled();
  });
});
