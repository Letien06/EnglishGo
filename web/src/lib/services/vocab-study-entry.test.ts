import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VocabWordDoc } from "@/types/vocab";

const mocks = vi.hoisted(() => ({
  set: vi.fn(), words: vi.fn(), progressGet: vi.fn(), progressWhere: vi.fn(), collection: vi.fn(),
}));
vi.mock("./dautoeic-vocab", () => ({
  findDriveVocabSet: mocks.set, findDriveVocabWords: mocks.words,
  findDriveVocabWordsByIds: vi.fn(), listDriveVocabSets: vi.fn(),
}));
vi.mock("@/lib/firestore/db", () => ({ adminDb: { collection: mocks.collection } }));
vi.mock("./rate-limit", () => ({ enforceDailyActionLimit: vi.fn() }));
vi.mock("./study-activity", () => ({
  getStoredStudyStreakSummary: vi.fn(), getStudyStreak: vi.fn(), recordStudyActivity: vi.fn(),
}));

import { getFilteredSession, getFilteredSessionForPart, getStudyEntrySession } from "./vocab";

function word(id: number, externalPartId: string, externalOrderIndex: number): VocabWordDoc {
  return { id, setId: 12, word: `word-${id}`, meaning: "meaning", status: "PUBLISHED",
    sourceType: "DAUTOEIC", externalPartId, externalPartName: externalPartId.toUpperCase(), externalOrderIndex };
}
function progress(wordId: number, status = "MASTERED", extra: Record<string, number> = {}) {
  return { id: String(wordId), data: () => ({ uid: "user-1", setId: 12, wordId, status, ...extra }) };
}

describe("getStudyEntrySession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.set.mockResolvedValue({ id: 12, title: "Test", topic: "TOEIC", status: "PUBLISHED", sourceType: "DAUTOEIC" });
    mocks.words.mockResolvedValue([word(2, "lc", 2), word(1, "lc", 1), word(3, "rc", 1), word(4, "rc", 2)]);
    mocks.progressGet.mockResolvedValue({ docs: [] });
    mocks.progressWhere.mockReturnValue({ get: mocks.progressGet });
    mocks.collection.mockImplementation((name: string) => {
      if (name !== "users") throw new Error(`Unexpected collection ${name}`);
      return { doc: (uid: string) => {
        expect(uid).toBe("user-1");
        return { collection: (child: string) => {
          expect(child).toBe("userVocabProgress");
          return { where: mocks.progressWhere };
        } };
      } };
    });
  });

  it("resumes LC with all words and their mastery using one scoped progress query", async () => {
    mocks.progressGet.mockResolvedValue({ docs: [progress(1)] });
    const session = await getStudyEntrySession(12, "user-1", "continue");
    expect(session.set.externalPartId).toBe("lc");
    expect(session.words.map(({ id, mastered }) => [id, mastered])).toEqual([[1, true], [2, false]]);
    expect([session.masteredWords, session.totalWords]).toEqual([1, 2]);
    expect(mocks.words).toHaveBeenCalledExactlyOnceWith(12);
    expect(mocks.progressWhere).toHaveBeenCalledExactlyOnceWith("setId", "==", 12);
    expect(mocks.progressGet).toHaveBeenCalledTimes(1);
  });

  it("advances to RC when LC is mastered", async () => {
    mocks.progressGet.mockResolvedValue({ docs: [progress(1), progress(2)] });
    const session = await getStudyEntrySession(12, "user-1", "continue");
    expect(session.set.externalPartId).toBe("rc");
    expect(session.words.map(({ id }) => id)).toEqual([3, 4]);
  });

  it("starts LC before RC even when source words arrive in reverse part order", async () => {
    mocks.words.mockResolvedValue([word(3, "rc", 1), word(4, "rc", 2), word(2, "lc", 2), word(1, "lc", 1)]);
    const session = await getStudyEntrySession(12, "user-1", "continue");
    expect(session.set.externalPartId).toBe("lc");
    expect(session.words.map(({ id }) => id)).toEqual([1, 2]);
  });

  it("applies oldest review ordering before limiting filtered whole-set and part sessions", async () => {
    const now = Date.now();
    const words = [word(1, "lc", 1), word(2, "lc", 2), word(3, "rc", 1), word(4, "rc", 2)];
    mocks.words.mockImplementation(async (_setId: number, partId?: string) =>
      partId ? words.filter((item) => item.externalPartId === partId) : words);
    mocks.progressGet.mockResolvedValue({ docs: [
      progress(1, "MASTERED", { nextReviewAtMillis: now + 100000, lastReviewedAtMillis: 10 }),
      progress(2, "MASTERED", { nextReviewAtMillis: now - 1000, lastReviewedAtMillis: 30 }),
      progress(3, "MASTERED", { nextReviewAtMillis: now - 1000 }),
      progress(4, "LEARNING", { nextReviewAtMillis: now - 1000 }),
    ] });
    const whole = await getFilteredSession(12, "user-1", "mastered", "oldest", "2", false);
    expect(whole.words.map(({ id }) => id)).toEqual([3, 2]);
    const part = await getFilteredSessionForPart(12, "user-1", "lc", "mastered", "oldest", "all", false);
    expect(part.words.map(({ id }) => id)).toEqual([2, 1]);
    expect(part.words.every(({ mastered }) => mastered)).toBe(true);
    const original = await getFilteredSession(12, "user-1", "mastered", "ordered", "all", false);
    expect(original.words.map(({ id }) => id)).toEqual([1, 2, 3]);
  });

  it("keeps a fully mastered set completed and respects an explicit part", async () => {
    mocks.progressGet.mockResolvedValue({ docs: [1, 2, 3, 4].map((id) => progress(id)) });
    const completed = await getStudyEntrySession(12, "user-1", "continue");
    expect(completed.set.externalPartId).toBe("lc");
    expect(completed.words.every(({ mastered }) => mastered)).toBe(true);
    expect(completed.masteredWords).toBe(completed.totalWords);
    const explicit = await getStudyEntrySession(12, "user-1", "continue", " rc ");
    expect(explicit.words.map(({ id }) => id)).toEqual([3, 4]);
  });

  it("reviews only mastered words, due first then oldest reviewed with source-order ties", async () => {
    const now = Date.now();
    mocks.words.mockResolvedValue([word(1, "lc", 1), word(2, "lc", 2), word(3, "rc", 1), word(4, "rc", 2), word(5, "rc", 3), word(6, "rc", 4)]);
    mocks.progressGet.mockResolvedValue({ docs: [
      progress(1, "MASTERED", { nextReviewAtMillis: now + 100000, lastReviewedAtMillis: 20 }),
      progress(2, "MASTERED", { nextReviewAtMillis: now - 1000, lastReviewedAtMillis: 30 }),
      progress(3, "MASTERED", { nextReviewAtMillis: now - 1000 }),
      progress(4, "LEARNING", { nextReviewAtMillis: now - 1000 }),
      progress(5, "MASTERED", { nextReviewAtMillis: now - 1000, lastReviewedAtMillis: 30 }),
    ] });
    const review = await getStudyEntrySession(12, "user-1", "review");
    expect(review.words.map(({ id }) => id)).toEqual([3, 2, 5, 1]);
    expect(review.words.every(({ mastered }) => mastered)).toBe(true);
    expect(review.set.externalPartId).toBeUndefined();
    expect([review.masteredWords, review.totalWords]).toEqual([4, 6]);
    const explicit = await getStudyEntrySession(12, "user-1", "review", "rc");
    expect(explicit.words.map(({ id }) => id)).toEqual([3, 5]);
  });

  it("handles empty sets and rejects missing parts, missing sets, and anonymous access", async () => {
    mocks.words.mockResolvedValue([]);
    expect((await getStudyEntrySession(12, "user-1", "review")).words).toEqual([]);
    await expect(getStudyEntrySession(12, "user-1", "continue", "missing")).rejects.toThrow();
    mocks.set.mockResolvedValue(null);
    await expect(getStudyEntrySession(12, "user-1", "continue")).rejects.toThrow();
    await expect(getStudyEntrySession(12, "", "review")).rejects.toThrow();
  });

  it("allows anonymous continuation without reading user progress", async () => {
    const session = await getStudyEntrySession(12, null, "continue");
    expect(session.set.externalPartId).toBe("lc");
    expect(session.words.map(({ id, mastered }) => [id, mastered])).toEqual([[1, false], [2, false]]);
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.progressGet).not.toHaveBeenCalled();
  });
});
