import type { VocabWordCard } from "@/types/vocab";
import { arcadeDuration, arcadePoints, type VocabularyRoundAnswer } from "./vocab-arcade";
import { normalizeVocabularyAnswer } from "./vocab-content";

export interface RainDrop { index: number; lane: number; born: number }
export interface RainState {
  words: VocabWordCard[]; drops: RainDrop[]; nextIndex: number; time: number;
  nextSpawn: number; paused: boolean; untimed: boolean; lives: number;
  score: number; combo: number; answers: VocabularyRoundAnswer[];
  notice: string; lastCorrect: boolean; done: boolean;
}
export type RainAction = { type: "tick"; delta: number } | { type: "pause"; paused: boolean } | { type: "answer"; value: string };

export function createRainState(words: VocabWordCard[], untimed = false): RainState {
  return { words, drops: words.length ? [{ index: 0, lane: 0, born: 0 }] : [], nextIndex: Math.min(1, words.length), time: 0, nextSpawn: 3_800, paused: false, untimed, lives: 3, score: 0, combo: 0, answers: [], notice: "", lastCorrect: false, done: !words.length };
}

export function rainFraction(state: RainState, drop: RainDrop) {
  return state.untimed ? 0 : Math.min(1, (state.time - drop.born) / arcadeDuration(drop.index));
}

function replenish(state: RainState): RainState {
  if (!state.lives) return { ...state, done: true };
  if (!state.drops.length && state.nextIndex >= state.words.length) return { ...state, done: true };
  if (state.nextIndex < state.words.length && (!state.drops.length || (!state.untimed && state.drops.length < 2 && state.time >= state.nextSpawn))) {
    const lane = state.drops.some((drop) => drop.lane === 0) ? 1 : 0;
    return { ...state, drops: [...state.drops, { index: state.nextIndex, lane, born: state.time }], nextIndex: state.nextIndex + 1, nextSpawn: state.time + 3_800 };
  }
  return state;
}

export function rainReducer(state: RainState, action: RainAction): RainState {
  if (action.type === "pause") return { ...state, paused: action.paused };
  if (state.done || state.paused) return state;
  if (action.type === "answer") {
    const answer = normalizeVocabularyAnswer(action.value);
    if (!answer) return state;
    const drop = state.drops.find((entry) => normalizeVocabularyAnswer(state.words[entry.index].word) === answer);
    if (!drop) return { ...state, notice: "Chưa khớp, thử lại nhé.", lastCorrect: false };
    const word = state.words[drop.index];
    const points = arcadePoints("rain", rainFraction(state, drop), state.combo);
    return replenish({ ...state, drops: state.drops.filter((entry) => entry !== drop), score: state.score + points, combo: state.combo + 1, notice: `Chính xác! ${word.word} · +${points} điểm`, lastCorrect: true, answers: [...state.answers, { item: word, correct: true, selected: action.value, expected: word.word }] });
  }
  if (state.untimed || !Number.isFinite(action.delta) || action.delta <= 0) return state;
  const targetTime = state.time + action.delta;
  let next = state;
  while (next.time < targetTime && !next.done) {
    const expiry = Math.min(...next.drops.map((drop) => drop.born + arcadeDuration(drop.index)));
    const spawn = next.drops.length < 2 && next.nextIndex < next.words.length ? Math.max(next.time, next.nextSpawn) : Infinity;
    const time = Math.min(targetTime, expiry, spawn);
    next = { ...next, time };
    for (const drop of next.drops.filter((entry) => entry.born + arcadeDuration(entry.index) <= time)) {
      if (!next.lives) break;
      const word = next.words[drop.index];
      next = { ...next, lives: next.lives - 1, combo: 0, lastCorrect: false, notice: `Để lọt: ${word.word} — ${word.meaning}`, drops: next.drops.filter((entry) => entry !== drop), answers: [...next.answers, { item: word, correct: false, selected: "Hết giờ", expected: word.word }] };
    }
    next = replenish(next);
  }
  return next;
}
