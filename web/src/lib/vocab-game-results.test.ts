import { describe, expect, it } from "vitest";
import { consolidateVocabGameAnswers } from "./vocab-game-results";

describe("consolidateVocabGameAnswers", () => {
  it("keeps one final result per word and preserves an earlier mistake", () => {
    const outcomes = consolidateVocabGameAnswers([
      { id: 10, correct: false },
      { id: 11, correct: true },
      { id: 10, correct: true },
    ]);

    expect(outcomes).toEqual([
      { answer: { id: 10, correct: true }, needsReview: true },
      { answer: { id: 11, correct: true }, needsReview: false },
    ]);
  });
});
