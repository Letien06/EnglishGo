import { describe, expect, it } from "vitest";
import type { VocabWordCard } from "@/types/vocab";
import { arcadeDuration, arcadePoints, arcadeReducer, arcadeWords, blastOptions, createArcadeState, rainHint } from "./vocab-arcade";
import { consolidateVocabGameAnswers } from "./vocab-game-results";

const words: VocabWordCard[] = ["carry", "remove", "pour", "beverage"].map((word, index) => ({ id: index + 1, word, meaning: `meaning ${index}`, mastered: false }));

describe("vocabulary arcade rules", () => {
  it("deduplicates words, excludes ambiguous distractors and supports small sets", () => {
    expect(arcadeWords([...words, { ...words[0], id: 90, word: " CARRY " }])).toHaveLength(4);
    expect(blastOptions(words[0], [words[0]])).toEqual([words[0]]);
    const options = blastOptions(words[0], [...words, { ...words[1], id: 91, meaning: words[0].meaning }]);
    expect(options).toHaveLength(4);
    expect(options.some((word) => word.id === 91)).toBe(false);
  });
  it("bounds speed, progressive hints and combo rewards", () => {
    expect(arcadeDuration(0)).toBe(18000);
    expect(arcadeDuration(100)).toBe(8000);
    expect(rainHint("carry a bag", 0)).toBe("_____ _ ___");
    expect(rainHint("carry", 0.5)).toBe("ca___");
    expect(rainHint("carry", 0.8)).toBe("carr_");
    expect(arcadePoints("rain", 0, 0)).toBe(15);
    expect(arcadePoints("rain", 0.5, 3)).toBe(20);
    expect(arcadePoints("rain", 0.8, 99)).toBe(20);
    expect(arcadePoints("blast", 0.8, 99)).toBe(10);
  });
  it("records a timeout exactly once and ignores ticks while paused or untimed", () => {
    const initial = createArcadeState("rain", words);
    const paused = arcadeReducer(initial, { type: "pause", paused: true });
    expect(arcadeReducer(paused, { type: "tick", delta: 20000 })).toBe(paused);
    const expired = arcadeReducer(initial, { type: "tick", delta: 20000 });
    expect(expired).toMatchObject({ lives: 2, phase: "feedback", combo: 0 });
    expect(expired.answers).toHaveLength(1);
    expect(arcadeReducer(expired, { type: "tick", delta: 20000 })).toBe(expired);
    const untimed = { ...initial, untimed: true };
    expect(arcadeReducer(untimed, { type: "tick", delta: 99999 })).toBe(untimed);
  });
  it("keeps a missed word in review even after a successful retry", () => {
    const initial = createArcadeState("blast", words);
    const target = initial.words[0];
    const wrong = initial.options[0].find((word) => word.id !== target.id)!;
    const missed = arcadeReducer(initial, { type: "answer", value: wrong.word, optionId: wrong.id });
    expect(missed.lives).toBe(2);
    expect(arcadeReducer(missed, { type: "answer", value: wrong.word, optionId: wrong.id })).toBe(missed);
    const correct = arcadeReducer(missed, { type: "answer", value: target.word, optionId: target.id });
    expect(correct).toMatchObject({ score: 10, phase: "feedback" });
    expect(consolidateVocabGameAnswers(correct.answers.map((answer) => ({ id: answer.item.id, correct: answer.correct })))[0].needsReview).toBe(true);
    expect(arcadeReducer(correct, { type: "answer", value: target.word, optionId: target.id })).toBe(correct);
  });
  it("allows typing retries, accepts full phrases only, and resets state for the next word", () => {
    const initial = createArcadeState("rain", words);
    const wrong = arcadeReducer(initial, { type: "answer", value: initial.words[0].word.slice(0, 2) });
    expect(wrong).toMatchObject({ lives: 3, score: 0, phase: "playing" });
    const correct = arcadeReducer(wrong, { type: "answer", value: ` ${initial.words[0].word.toUpperCase()} ` });
    expect(correct.score).toBe(15);
    expect(arcadeReducer(correct, { type: "next" })).toMatchObject({ index: 1, elapsed: 0, phase: "playing", notice: "" });
  });
  it("does not advance after the last life or beyond the last word", () => {
    const initial = createArcadeState("rain", words.slice(0, 1));
    const ended = arcadeReducer({ ...initial, lives: 1 }, { type: "tick", delta: 20000 });
    expect(arcadeReducer(ended, { type: "next" })).toBe(ended);
    expect(ended.lives).toBe(0);
    expect(createArcadeState("blast", []).words).toEqual([]);
  });
  it("defaults to using all words in the pool and respects an optional limit", () => {
    const largePool: VocabWordCard[] = Array.from({ length: 80 }, (_, i) => ({
      id: i + 1,
      word: `word${i + 1}`,
      meaning: `meaning ${i + 1}`,
      mastered: false,
    }));
    const fullState = createArcadeState("blast", largePool);
    expect(fullState.words).toHaveLength(80);
    expect(fullState.options).toHaveLength(80);

    const limitedState = createArcadeState("blast", largePool, false, 20);
    expect(limitedState.words).toHaveLength(20);
    expect(limitedState.options).toHaveLength(20);
  });
});
