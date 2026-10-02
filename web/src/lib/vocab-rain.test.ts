import { describe, expect, it } from "vitest";
import { createRainState, rainReducer } from "./vocab-rain";

const words = ["carry", "office", "invoice", "shelf", "meeting"].map((word, index) => ({ id: index + 1, word, meaning: `Nghĩa ${index}`, mastered: false }));

describe("concurrent vocabulary rain", () => {
  it("spawns staggered drops into separate lanes and accepts either answer", () => {
    let state = rainReducer(createRainState(words), { type: "tick", delta: 4000 });
    expect(state.drops).toHaveLength(2);
    expect(state.drops.map((drop) => drop.lane)).toEqual([0, 1]);
    state = rainReducer(state, { type: "answer", value: " OFFICE " });
    expect(state.score).toBe(15);
    expect(state.drops.map((drop) => drop.index)).toEqual([0]);
    expect(state.answers[0]).toMatchObject({ item: words[1], correct: true });
    state = rainReducer(state, { type: "answer", value: "office" });
    expect(state.answers).toHaveLength(1);
  });
  it("pauses clock and answers, does not penalize a typo, and resumes safely", () => {
    const initial = createRainState(words);
    expect(rainReducer(initial, { type: "answer", value: "typo" }).lives).toBe(3);
    const paused = rainReducer(initial, { type: "pause", paused: true });
    expect(rainReducer(paused, { type: "tick", delta: 30000 })).toBe(paused);
    expect(rainReducer(paused, { type: "answer", value: "carry" })).toBe(paused);
    const resumed = rainReducer(paused, { type: "pause", paused: false });
    expect(rainReducer(resumed, { type: "tick", delta: 1000 }).time).toBe(1000);
  });
  it("processes delayed ticks chronologically and records only three missed words", () => {
    const state = rainReducer(createRainState(words), { type: "tick", delta: 120000 });
    expect(state.lives).toBe(0);
    expect(state.done).toBe(true);
    expect(state.answers).toHaveLength(3);
    expect(state.answers.every((answer) => !answer.correct)).toBe(true);
    expect(rainReducer(state, { type: "tick", delta: 1000 })).toBe(state);
  });
  it("handles an untimed single-word session without duplicate scoring", () => {
    const initial = createRainState(words.slice(0, 1), true);
    expect(rainReducer(initial, { type: "tick", delta: 900000 })).toBe(initial);
    const done = rainReducer(initial, { type: "answer", value: "carry" });
    expect(done.done).toBe(true);
    expect(done.score).toBe(15);
    expect(rainReducer(done, { type: "answer", value: "carry" })).toBe(done);
  });
  it("reduces points with hints and increments combos", () => {
    let state = createRainState(words);
    state = rainReducer(state, { type: "tick", delta: 14000 });
    state = rainReducer(state, { type: "answer", value: "carry" });
    expect(state.score).toBe(5);
    expect(state.combo).toBe(1);
  });
  it("handles empty data and invalid deltas", () => {
    expect(createRainState([]).done).toBe(true);
    const state = createRainState(words);
    for (const delta of [0, -1, NaN, Infinity]) expect(rainReducer(state, { type: "tick", delta })).toBe(state);
  });
});
