import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], reads: 0, queries: [] as { field: string; ids: string[] }[], session: { items: [] as { id: string; questions: { id: string }[] }[] } }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback, revalidateTag: vi.fn() }));
vi.mock("../server-cache", () => ({ readServerCache: (callback: () => unknown) => callback() }));
vi.mock("./dautoeic", () => ({ listDifficultyLevels: async () => [{ level: 1, itemIds: ["current"] }], listReadingDifficultyLevels: async () => [{ level: 1, itemIds: ["current"] }], getDifficultySession: vi.fn(), getReadingDifficultySession: vi.fn() }));
vi.mock("./test-part-practice", () => ({ getTestPartSession: async () => state.session }));
vi.mock("./learning-progress-projection", () => ({ readLearningProgressProjection: vi.fn(), learningProgressProjectionShard: vi.fn(), prepareLearningProgressProjection: vi.fn() }));
vi.mock("./learning-progress-save", () => ({ saveLearningProgress: vi.fn() }));
vi.mock("./leaderboard", () => ({ recordSkillQuestionLeaderboard: vi.fn() }));
vi.mock("./study-activity", () => ({ recordStudyActivity: vi.fn() }));
vi.mock("../firestore/db", () => ({ adminDb: { collection: () => ({ doc: () => ({ collection: () => ({ where: (field: string, _op: string, ids: string[]) => ({ get: async () => {
  state.queries.push({ field, ids });
  const rows = state.rows.filter((row) => ids.includes(row[field] as string));
  state.reads += Math.max(1, rows.length);
  return { docs: rows.map((row) => ({ data: () => row })) };
} }) }) }) }) } }));
import { createLearningToolService } from "./learning-tool-service";
const service = createLearningToolService({ module: "reading", minPart: 5, maxPart: 7, progressCollection: "readingProgress", notesCollection: "notes", favoritesCollection: "favorites", vocabBasketCollection: "basket" });
beforeEach(() => { state.rows = []; state.reads = 0; state.queries = []; state.session = { items: [] }; });

describe("scoped progress Firestore reads", () => {
  it("reads only the current test's saved answers instead of all 1080 Part rows", async () => {
    state.rows = Array.from({ length: 1080 }, (_, index) => ({ questionId: `q${index}`, itemId: `item${index}`, part: 7, selectedAnswer: "B" }));
    state.session = { items: [{ id: "passage", questions: [{ id: "q0" }, { id: "q1" }, { id: "q2" }] }] };
    expect(await service.loadAnswers("u", 7, 1, "current-test")).toEqual({ q0: "B", q1: "B", q2: "B" });
    expect(state.reads).toBe(3);
    expect(state.queries).toEqual([{ field: "questionId", ids: ["q0", "q1", "q2"] }]);
  });
  it("chunks more than 30 question IDs and excludes foreign-part records", async () => {
    state.rows = Array.from({ length: 61 }, (_, index) => ({ questionId: `q${index}`, itemId: "passage", part: index === 60 ? 6 : 7, selectedAnswer: "A" }));
    state.session = { items: [{ id: "passage", questions: state.rows.map((row) => ({ id: row.questionId as string })) }] };
    expect(Object.keys(await service.loadAnswers("u", 7, 1, "current-test"))).toHaveLength(60);
    expect(state.queries).toHaveLength(3);
    expect(state.queries.every((query) => query.ids.length <= 30)).toBe(true);
  });
  it("matches current balanced item membership despite old saved difficulty levels", async () => {
    state.rows = [
      { questionId: "q1", itemId: "current", part: 6, level: 4, selectedAnswer: "B", correct: true },
      { questionId: "q2", itemId: "current", part: 6, level: 4, selectedAnswer: "A", correct: false },
      { questionId: "retired", itemId: "retired", part: 6, selectedAnswer: "A" },
    ];
    expect(await service.loadAnswers("u", 6, 1)).toEqual({ q1: "B", q2: "A" });
    expect(await service.summarize("u", 6, 1)).toMatchObject({ done: 1, correct: 1, wrong: 1 });
    expect(state.reads).toBe(4);
    expect(state.queries.every((query) => query.field === "itemId")).toBe(true);
  });
  it("does not query Firestore for an empty selection or anonymous learner", async () => {
    expect(await service.loadAnswers("u", 7, 1, "empty-test")).toEqual({});
    expect(await service.loadAnswers("", 7, 1, "empty-test")).toEqual({});
    expect(state.reads).toBe(0);
  });
});
