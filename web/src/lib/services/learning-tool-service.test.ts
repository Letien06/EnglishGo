import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicDifficultyLevel } from "@/types/dautoeic";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(),
  levels: vi.fn(),
}));

vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback, revalidateTag: vi.fn() }));
vi.mock("./leaderboard", () => ({ recordSkillQuestionLeaderboard: vi.fn() }));
vi.mock("./study-activity", () => ({ recordStudyActivity: vi.fn() }));
vi.mock("./dautoeic", () => ({ listDifficultyLevels: mocks.levels, listReadingDifficultyLevels: mocks.levels }));
vi.mock("../firestore/db", () => ({
  adminDb: {
    collection: () => ({ doc: () => ({ collection: () => ({
      where: vi.fn().mockReturnThis(),
      get: mocks.get,
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
});

describe("progress against the current content catalog", () => {
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
