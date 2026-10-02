import { beforeEach, describe, expect, it } from "vitest";
import { cacheLearningLevels, readCachedLearningLevels } from "./client-learning-progress-cache";
import type { DauToeicDifficultyLevel } from "@/types/dautoeic";

beforeEach(() => window.localStorage.clear());

describe("learning progress cache migration", () => {
  it("ignores the old level-3-only catalog after publishing balanced groups", () => {
    window.localStorage.setItem("englishgo:learning-levels:dauenglish-v2:learner:listening:2", JSON.stringify({
      savedAt: Date.now(), levels: [{ level: 3, total: 250, done: 10 }],
    }));
    expect(readCachedLearningLevels("listening", 2, "learner")).toBeNull();
  });

  it("ignores cached progress from the five-level source", () => {
    window.localStorage.setItem("englishgo:learning-levels:v1:learner:listening:1", JSON.stringify({
      savedAt: Date.now(), levels: [{ level: 1, total: 1, done: 36 }],
    }));
    expect(readCachedLearningLevels("listening", 1, "learner")).toBeNull();
  });

  it("retains current progress under the new catalog version and isolates learners", () => {
    const levels: DauToeicDifficultyLevel[] = [{
      part: 1, level: 1, title: "Level 1", itemIds: ["current"], total: 1,
      done: 1, correct: 1, wrong: 0, remaining: 0, errorRateMin: null, errorRateMax: null,
      totalAttempts: 0, wrongAttempts: 0,
    }];
    cacheLearningLevels("listening", 1, levels, "learner");
    expect(readCachedLearningLevels("listening", 1, "learner")).toEqual(levels);
    expect(readCachedLearningLevels("listening", 1, "other")).toBeNull();
  });
});
