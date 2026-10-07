import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicDifficultyLevel } from "@/types/dautoeic";
import type { TestPartCatalogEntry } from "./test-part-practice";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(),
  levels: vi.fn(),
  session: vi.fn(),
  testSession: vi.fn(),
  set: vi.fn(),
  award: vi.fn(),
  activity: vi.fn(),
}));

vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback, revalidateTag: vi.fn() }));
vi.mock("./leaderboard", () => ({ recordSkillQuestionLeaderboard: mocks.award }));
vi.mock("./study-activity", () => ({ recordStudyActivity: mocks.activity }));
vi.mock("./dautoeic", () => ({ listDifficultyLevels: mocks.levels, listReadingDifficultyLevels: mocks.levels, getDifficultySession: mocks.session, getReadingDifficultySession: mocks.session }));
vi.mock("./test-part-practice", () => ({ getTestPartSession: mocks.testSession }));
vi.mock("../firestore/db", () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ collection: () => ({
      where: vi.fn().mockReturnThis(),
      get: mocks.get,
      doc: () => ({ set: mocks.set }),
    }) }) }),
    batch: () => ({ delete: mocks.delete, commit: mocks.commit }),
  },
}));

import { createLearningToolService } from "./learning-tool-service";

const service = createLearningToolService({
  module: "listening", minPart: 1, maxPart: 4,
  progressCollection: "listeningProgress", notesCollection: "notes",
  favoritesCollection: "favorites", vocabBasketCollection: "vocabBasket",
});

function level(levelNumber: number, itemIds: string[], part = 1): DauToeicDifficultyLevel {
  return {
    part, level: levelNumber, itemIds, title: null, errorRateMin: null, errorRateMax: null,
    total: itemIds.length, done: 0, correct: 0, wrong: 0, remaining: itemIds.length,
    totalAttempts: 0, wrongAttempts: 0,
  };
}

function progress(itemId: string, overrides: Record<string, unknown> = {}) {
  return { itemId, questionId: itemId, part: 1, level: 1, selectedAnswer: "A", correct: true, ...overrides };
}

function rows(entries: Record<string, unknown>[]) {
  mocks.get.mockResolvedValue({ docs: entries.map((entry) => ({
    data: () => entry, ref: { id: entry.questionId },
  })) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.commit.mockResolvedValue(undefined);
  mocks.levels.mockResolvedValue([]);
  mocks.set.mockResolvedValue(undefined);
  mocks.award.mockResolvedValue(undefined);
  mocks.activity.mockResolvedValue(undefined);
  mocks.testSession.mockResolvedValue({ items: [{ id: "passage", sourceLevel: 3, questions: [{ id: "q1", correctAnswer: "B" }, { id: "q2", correctAnswer: "A" }] }] });
});

describe("progress scoped to an exam test part", () => {
  const request = { testId: "test-one", part: 3, level: 1, itemId: "passage", questionId: "q1", selectedAnswer: "B", correctAnswer: "A", modeUsed: "normal", assistPercent: 30, replayCount: 0, elapsedSeconds: 1 };
  const catalog = (testId: string, questionIds: string[]): TestPartCatalogEntry => ({
    test: { testId, testName: "Test 1", setName: testId, part: 3, questionCount: questionIds.length, itemCount: 1, done: 0, correct: 0, wrong: 0, nextIndex: 0 },
    items: [{ id: "passage", questionIds }],
  });

  it("keeps old level history by question, counts a partial passage, and isolates tests", async () => {
    rows([progress("old-item", { part: 3, level: 4, questionId: "q1", selectedAnswer: "B" }), progress("other-test", { part: 3, questionId: "q3", correct: false })]);
    const result = await service.applyTestProgress("learner", [catalog("test-one", ["q1", "q2"]), catalog("test-two", ["q3"])]);
    expect(result[0]).toMatchObject({ done: 1, correct: 1, wrong: 0, nextIndex: 0, questionCount: 2 });
    expect(result[1]).toMatchObject({ done: 1, correct: 0, wrong: 1 });
    await expect(service.loadAnswers("learner", 3, 1, "test-one")).resolves.toEqual({ q1: "B" });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("resumes at the first incomplete passage", async () => {
    rows([progress("old", { part: 3, questionId: "q1" }), progress("old", { part: 3, questionId: "q2" })]);
    const entry = catalog("test-one", ["q1", "q2", "q3"]);
    entry.items = [{ id: "first", questionIds: ["q1", "q2"] }, { id: "second", questionIds: ["q3"] }];
    expect((await service.applyTestProgress("learner", [entry]))[0]).toMatchObject({ done: 2, nextIndex: 1 });
  });

  it("resets only questions belonging to the selected test and Part", async () => {
    rows([progress("old-item", { part: 3, questionId: "q1" }), progress("other", { part: 3, questionId: "q3" })]);
    await service.resetLevel("learner", { ...request, note: null, word: null, meaning: null, example: null, favorite: null });
    expect(mocks.delete).toHaveBeenCalledExactlyOnceWith({ id: "q1" });
  });

  it("uses the source answer and level, ignoring client answer and scoring level", async () => {
    await service.recordProgress("learner", { ...request, level: 4 });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ testId: "test-one", correctAnswer: "B", correct: true, sourceLevel: 3, score: 30 }), { merge: true });
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({ level: 3 }));
    expect(mocks.activity).toHaveBeenCalledWith("learner", expect.objectContaining({ metric: "listening", quantity: 1, durationSeconds: 1 }));
  });

  it("does not award points when a client spoofs the correct answer", async () => {
    await service.recordProgress("learner", { ...request, selectedAnswer: "A", correctAnswer: "A" });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ correct: false, correctAnswer: "B", score: 0 }), { merge: true });
    expect(mocks.award).not.toHaveBeenCalled();
    expect(mocks.activity).toHaveBeenCalledWith("learner", expect.objectContaining({ metric: "listening", quantity: 1 }));
  });

  it("counts a reading answer as a question without substituting lesson or test totals", async () => {
    const readingService = createLearningToolService({ module: "reading", minPart: 5, maxPart: 7,
      progressCollection: "readingProgress", notesCollection: "notes", favoritesCollection: "favorites", vocabBasketCollection: "vocabBasket" });
    await readingService.recordProgress("learner", { ...request, part: 5, selectedAnswer: "A" });
    expect(mocks.activity).toHaveBeenCalledWith("learner", expect.objectContaining({ module: "reading", metric: "reading", quantity: 1, durationSeconds: 1 }));
  });

  it("preserves the original Part 1 scoring when its source difficulty differs", async () => {
    mocks.levels.mockResolvedValue([level(4, ["passage"])]);
    await service.recordProgress("learner", { ...request, part: 1 });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ sourceLevel: 4, score: 40 }), { merge: true });
  });

  it("preserves source scoring when the question belonged to a balanced group", async () => {
    mocks.levels.mockResolvedValue([{ ...level(2, ["passage"], 3), grouping: "balanced" }]);
    mocks.session.mockResolvedValue({ items: [{ id: "passage", sourceLevel: 2, questions: [{ id: "q1" }] }] });
    await service.recordProgress("learner", request);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ sourceLevel: 2, score: 20 }), { merge: true });
  });

  it.each([{ itemId: "foreign-item" }, { questionId: "foreign-question" }, { selectedAnswer: "Z" }, { part: 7 }, { part: 1.5 }])("rejects invalid test answers: %j", async (overrides) => {
    await expect(service.recordProgress("learner", { ...request, ...overrides })).rejects.toThrow();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("does not access private history for guests", async () => {
    const entries = [catalog("test-one", ["q1"])];
    await expect(service.applyTestProgress(null, entries)).resolves.toEqual(entries.map((entry) => entry.test));
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe("progress against the current content catalog", () => {
  it.each([1, 2, 3, 4])("keeps original points for balanced group %i", async (group) => {
    mocks.levels.mockResolvedValue([{ ...level(group, ["item"], 2), grouping: "balanced" }]);
    mocks.session.mockResolvedValue({ items: [{ id: "item", sourceLevel: 3, questions: [{ id: "question" }] }] });
    await service.recordProgress("learner", {
      part: 2, level: group, itemId: "item", questionId: "question", selectedAnswer: "A", correctAnswer: "A",
      modeUsed: "normal", assistPercent: 30, replayCount: 0, elapsedSeconds: 1,
    });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ level: group, sourceLevel: 3, score: 30 }), { merge: true });
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({ level: 3, questionId: "question" }));
  });

  it("retains source-tier scoring for parts that were not regrouped", async () => {
    mocks.levels.mockResolvedValue([level(4, ["item"])]);
    await service.recordProgress("learner", {
      part: 1, level: 4, itemId: "item", questionId: "question", selectedAnswer: "A", correctAnswer: "A",
      modeUsed: "normal", assistPercent: 30, replayCount: 0, elapsedSeconds: 1,
    });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ level: 4, score: 40 }), { merge: true });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it("uses the saved source level for a reading group and awards nothing for a wrong answer", async () => {
    const reading = createLearningToolService({
      module: "reading", minPart: 5, maxPart: 7,
      progressCollection: "readingProgress", notesCollection: "notes",
      favoritesCollection: "favorites", vocabBasketCollection: "vocabBasket",
    });
    mocks.levels.mockResolvedValue([{ ...level(4, ["item"], 6), grouping: "balanced" }]);
    mocks.session.mockResolvedValue({ items: [{ id: "item", sourceLevel: 2, questions: [{ id: "question" }] }] });
    const request = {
      part: 6, level: 4, itemId: "item", questionId: "question", selectedAnswer: "A", correctAnswer: "A",
      modeUsed: "normal", assistPercent: 30, replayCount: 0, elapsedSeconds: 1,
    };
    await reading.recordProgress("learner", request);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ level: 4, sourceLevel: 2, score: 20 }), { merge: true });
    expect(mocks.award).toHaveBeenCalledWith(expect.objectContaining({ module: "reading", level: 2 }));
    mocks.award.mockClear();
    await reading.recordProgress("learner", { ...request, selectedAnswer: "B" });
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ score: 0 }), { merge: true });
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("rejects grouped progress for a question outside the requested group", async () => {
    mocks.levels.mockResolvedValue([{ ...level(1, ["item"], 2), grouping: "balanced" }]);
    mocks.session.mockResolvedValue({ items: [{ id: "item", sourceLevel: 3, questions: [{ id: "another-question" }] }] });
    await expect(service.recordProgress("learner", {
      part: 2, level: 1, itemId: "item", questionId: "question", selectedAnswer: "A", correctAnswer: "A",
      modeUsed: "normal", assistPercent: 30, replayCount: 0, elapsedSeconds: 1,
    })).rejects.toThrow("does not belong");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.award).not.toHaveBeenCalled();
  });

  it("keeps level-3 passage answers when balanced groups move them to group 1", async () => {
    rows([
      progress("moved", { part: 3, level: 3, questionId: "answer-1", selectedAnswer: "B" }),
      progress("moved", { part: 3, level: 3, questionId: "answer-2", correct: false }),
      progress("elsewhere", { part: 3, level: 3 }),
    ]);
    const groups = [{ ...level(1, ["moved"], 3), grouping: "balanced" as const }, level(2, ["elsewhere"], 3)];
    mocks.levels.mockResolvedValue(groups);
    const result = await service.applyProgress("learner", groups);
    expect(result[0]).toMatchObject({ grouping: "balanced", done: 1, correct: 1, wrong: 1 });
    await expect(service.loadAnswers("learner", 3, 1)).resolves.toEqual({ "answer-1": "B", "answer-2": "A" });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it("does not turn 36 historical completions into 3600% of one current item", async () => {
    rows(Array.from({ length: 36 }, (_, index) => progress(`old-${index}`)));
    const result = await service.applyProgress("learner", [level(1, ["current"])]);
    expect(result[0]).toMatchObject({ total: 1, done: 0, correct: 0, wrong: 0, remaining: 1 });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("keeps matching history when the source reclassifies an item", async () => {
    rows([progress("current"), progress("retired", { correct: false })]);
    const result = await service.applyProgress("learner", [level(1, []), level(2, ["current"])]);
    expect(result[0]).toMatchObject({ done: 0, correct: 0, wrong: 0 });
    expect(result[1]).toMatchObject({ done: 1, correct: 1, wrong: 0, remaining: 0 });
  });

  it("counts a passage once while retaining question-level correct and wrong counts", async () => {
    rows([
      progress("passage", { part: 3, questionId: "question-1" }),
      progress("passage", { part: 3, questionId: "question-2", correct: false }),
    ]);
    const result = await service.applyProgress("learner", [level(1, ["passage"], 3)]);
    expect(result[0]).toMatchObject({ done: 1, correct: 1, wrong: 1, remaining: 0 });
  });

  it("keeps batched parts separate and excludes missing item IDs", async () => {
    rows([progress("same"), progress("same", { part: 2, correct: false }), progress("", { part: 2 })]);
    const result = await service.applyProgressBatch("learner", [
      { part: 1, levels: [level(1, ["same"])] },
      { part: 2, levels: [level(1, ["same"], 2)] },
    ]);
    expect(result[0].levels[0]).toMatchObject({ done: 1, correct: 1, wrong: 0 });
    expect(result[1].levels[0]).toMatchObject({ done: 1, correct: 0, wrong: 1 });
  });

  it("loads answers and summaries from current membership, not historical level numbers", async () => {
    rows([progress("current", { selectedAnswer: " b " }), progress("retired")]);
    mocks.levels.mockResolvedValue([level(1, []), level(2, ["current"])]);
    await expect(service.loadAnswers("learner", 1, 2)).resolves.toEqual({ current: "B" });
    await expect(service.summarize("learner", 1, 2)).resolves.toMatchObject({ done: 1, correct: 1 });
  });

  it("resets only current membership without deleting retired history", async () => {
    rows([progress("current"), progress("retired", { level: 2 })]);
    mocks.levels.mockResolvedValue([level(1, []), level(2, ["current"])]);
    await service.resetLevel("learner", {
      part: 1, level: 2, itemId: null, questionId: null, note: null, word: null,
      meaning: null, example: null, favorite: null,
    });
    expect(mocks.delete).toHaveBeenCalledExactlyOnceWith({ id: "current" });
  });

  it("does not query learner history for an anonymous dashboard", async () => {
    const levels = [level(1, ["current"])];
    await expect(service.applyProgress(null, levels)).resolves.toEqual(levels);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
