import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(), writes: vi.fn(), getAll: vi.fn(),
  words: vi.fn(), failCommit: false, retryCallback: false,
}));
type Ref = { path: string; doc: (id: string) => Ref; collection: (name: string) => Ref };
function ref(path: string): Ref {
  return { path, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`) };
}
function snapshot(reference: Ref) {
  const data = mocks.docs.get(reference.path);
  return { exists: data !== undefined, id: reference.path.split("/").at(-1), data: () => data };
}
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const run = async (commit: boolean) => {
      const staged: [Ref, Record<string, unknown>][] = [];
      const result = await callback({
        get: async (reference: Ref) => snapshot(reference),
        getAll: async (...refs: Ref[]) => {
          mocks.getAll(...refs);
          return refs.map(snapshot);
        },
        set: (reference: Ref, data: Record<string, unknown>) => staged.push([reference, data]),
      });
      if (mocks.failCommit) throw new Error("Commit failed");
      if (commit) for (const [reference, data] of staged) {
        mocks.writes(reference, data);
        mocks.docs.set(reference.path, { ...mocks.docs.get(reference.path), ...data });
      }
      return result;
    };
    if (mocks.retryCallback) await run(false);
    return run(true);
  },
} }));
vi.mock("./dautoeic-vocab", () => ({
  findDriveVocabWordsByIds: mocks.words, findDriveVocabSet: vi.fn(),
  findDriveVocabWords: vi.fn(), listDriveVocabSets: vi.fn(),
}));
vi.mock("./rate-limit", () => ({ enforceDailyActionLimit: vi.fn() }));
vi.mock("./study-activity", () => ({
  getStoredStudyStreakSummary: vi.fn(), getStudyStreak: vi.fn(), recordStudyActivity: vi.fn(),
}));
import { reviewBatch } from "./vocab";

describe("reviewBatch retry safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.docs.clear();
    mocks.failCommit = false;
    mocks.retryCallback = false;
    mocks.words.mockResolvedValue(new Map([[1, { id: 1, setId: 12, status: "PUBLISHED" }]]));
  });

  it("replays a committed response without applying SM-2 again or looking up words", async () => {
    const first = await reviewBatch("learner", [{ wordId: 1, quality: 4 }], "retry-1");
    expect(mocks.docs.get("users/learner/userVocabProgress/1")?.repetitions).toBe(1);
    const marker = mocks.docs.get("users/learner/vocabReviewRequests/retry-1");
    expect(marker).toMatchObject({ responses: first, expiresAt: expect.any(Date) });
    const writes = mocks.writes.mock.calls.length;
    mocks.words.mockRejectedValue(new Error("Material unavailable after original commit"));
    expect(await reviewBatch("learner", [{ wordId: 1, quality: 4 }], "retry-1")).toEqual(first);
    expect(mocks.writes).toHaveBeenCalledTimes(writes);
    expect(mocks.words).toHaveBeenCalledTimes(1);
    expect(mocks.getAll).toHaveBeenCalledTimes(1);
    expect(mocks.getAll.mock.calls[0].map((item: Ref) => item.path)).toEqual([
      "users/learner", "users/learner/userVocabProgress/1",
    ]);
  });

  it("rejects token reuse with different reviews and scopes tokens by user", async () => {
    await reviewBatch("one", [{ wordId: 1, mastered: true }], "same-token");
    await expect(reviewBatch("one", [{ wordId: 1, quality: 4 }], "same-token")).rejects.toMatchObject({ status: 400 });
    await reviewBatch("two", [{ wordId: 1, quality: 4 }], "same-token");
    expect(mocks.docs.get("users/two/userVocabProgress/1")?.repetitions).toBe(1);
    expect(mocks.docs.get("users/one/userVocabProgress/1")?.status).toBe("MASTERED");
  });

  it("commits marker and progress together and tolerates transaction callback retries", async () => {
    mocks.failCommit = true;
    await expect(reviewBatch("learner", [{ wordId: 1, quality: 4 }], "atomic")).rejects.toThrow("Commit failed");
    expect(mocks.docs.size).toBe(0);
    mocks.failCommit = false;
    mocks.retryCallback = true;
    mocks.words.mockClear();
    await reviewBatch("learner", [{ wordId: 1, quality: 4 }], "atomic");
    expect(mocks.words).toHaveBeenCalledTimes(1);
    expect(mocks.docs.get("users/learner/userVocabProgress/1")?.repetitions).toBe(1);
    expect(mocks.docs.has("users/learner/vocabReviewRequests/atomic")).toBe(true);
  });

  it("preserves repeated reviews without a token and validates token paths", async () => {
    await reviewBatch("learner", [{ wordId: 1, quality: 4 }]);
    await reviewBatch("learner", [{ wordId: 1, quality: 4 }]);
    expect(mocks.docs.get("users/learner/userVocabProgress/1")?.repetitions).toBe(2);
    expect([...mocks.docs.keys()].some((path) => path.includes("vocabReviewRequests"))).toBe(false);
    await expect(reviewBatch("learner", [{ wordId: 1, quality: 4 }], "invalid/path")).rejects.toMatchObject({ status: 400 });
  });
});
