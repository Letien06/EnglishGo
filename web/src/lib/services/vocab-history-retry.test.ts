import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeFirestoreWrite } from "@/test/firestore-merge";

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  writes: vi.fn(), rateLimit: vi.fn(), failCommit: false, retryCallback: false,
}));
type Ref = { path: string; doc: (id: string) => Ref; collection: (name: string) => Ref; get: () => Promise<ReturnType<typeof snapshot>> };
function ref(path: string): Ref {
  const reference: Ref = { path, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`), get: async () => snapshot(reference) };
  return reference;
}
function snapshot(reference: Ref) {
  const data = state.docs.get(reference.path);
  return { exists: data !== undefined, data: () => data };
}
vi.mock("@/lib/firestore/db", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const run = async (commit: boolean) => {
      const staged: [Ref, Record<string, unknown>][] = [];
      const result = await callback({
        get: async (reference: Ref) => snapshot(reference),
        set: (reference: Ref, data: Record<string, unknown>) => staged.push([reference, data]),
      });
      if (state.failCommit) throw new Error("Commit failed");
      if (commit) for (const [reference, data] of staged) {
        state.writes(reference, data);
        state.docs.set(reference.path, mergeFirestoreWrite(state.docs.get(reference.path) ?? {}, data));
      }
      return result;
    };
    if (state.retryCallback) await run(false);
    return run(true);
  },
} }));
vi.mock("./rate-limit", () => ({ enforceDailyActionLimit: state.rateLimit }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("./learner-cache", () => ({ invalidateLearnerActivityCaches: vi.fn(), studyStreakCacheTag: vi.fn() }));
import { recordStudyHistory } from "./vocab";

const session = {
  requestId: "round-1", setId: 12, title: "Word Blast", mode: "Word Blast",
  startedAtMillis: Date.parse("2026-10-07T10:00:00.000Z"),
  totalWords: 5, correctWords: 3, wrongWords: 2, accuracy: 60, score: 30,
};

describe("vocabulary result history retry safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rateLimit.mockResolvedValue(undefined);
    state.docs.clear(); state.failCommit = false; state.retryCallback = false;
    vi.setSystemTime(new Date("2026-10-07T10:01:30.000Z"));
  });

  it("replays a lost successful response without duplicate history, XP or time, even on a later day", async () => {
    const first = await recordStudyHistory("learner", session);
    const writes = state.writes.mock.calls.length;
    expect(state.docs.get("users/learner")).toMatchObject({ totalStudyXp: 5, totalStudyMetrics: { studySeconds: 90 } });
    state.rateLimit.mockRejectedValue(new Error("Daily limit reached"));
    vi.setSystemTime(new Date("2026-10-08T10:01:30.000Z"));
    expect(await recordStudyHistory("learner", session)).toEqual(first);
    expect(state.writes).toHaveBeenCalledTimes(writes);
    expect(state.rateLimit).toHaveBeenCalledTimes(1);
    expect([...state.docs.keys()].filter((path) => path.includes("vocabStudyHistory"))).toHaveLength(1);
  });

  it("rejects token reuse for changed results and scopes identical tokens to each learner", async () => {
    await recordStudyHistory("one", session);
    await expect(recordStudyHistory("one", { ...session, score: 40 })).rejects.toMatchObject({ status: 400 });
    await recordStudyHistory("two", session);
    expect(state.docs.get("users/one")).toMatchObject({ totalStudyXp: 5 });
    expect(state.docs.get("users/two")).toMatchObject({ totalStudyXp: 5 });
    await expect(recordStudyHistory("one", { ...session, requestId: "invalid/path" })).rejects.toMatchObject({ status: 400 });
  });

  it("commits history and accounting together and survives a transaction callback retry", async () => {
    state.failCommit = true;
    await expect(recordStudyHistory("learner", session)).rejects.toThrow("Commit failed");
    expect(state.docs.size).toBe(0);
    state.failCommit = false; state.retryCallback = true;
    await recordStudyHistory("learner", session);
    expect(state.docs.has("users/learner/vocabStudyHistory/request-round-1")).toBe(true);
    expect(state.docs.get("users/learner")).toMatchObject({ totalStudyXp: 5, totalStudyMetrics: { studySeconds: 90 } });
  });
});
