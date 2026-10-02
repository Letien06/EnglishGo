import type { VocabWordCard } from "@/types/vocab";
import { normalizeVocabularyAnswer } from "./vocab-content";

export type VocabularyArcadeMode = "blast" | "rain";
export interface VocabularyRoundAnswer {
  item: VocabWordCard;
  correct: boolean;
  selected: string;
  expected: string;
}
export interface VocabularyRoundResult {
  answers: VocabularyRoundAnswer[];
  score: number;
}

export function shuffleVocabulary<T>(items: readonly T[], random = Math.random): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function arcadeWords(words: VocabWordCard[]): VocabWordCard[] {
  const seen = new Set<string>();
  return words.filter((word) => {
    const key = normalizeVocabularyAnswer(word.word);
    if (!key || !word.meaning.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function blastOptions(word: VocabWordCard, pool: VocabWordCard[], random = Math.random): VocabWordCard[] {
  const distractors = arcadeWords(pool).filter((candidate) =>
    normalizeVocabularyAnswer(candidate.word) !== normalizeVocabularyAnswer(word.word) &&
    normalizeVocabularyAnswer(candidate.meaning) !== normalizeVocabularyAnswer(word.meaning));
  return shuffleVocabulary([word, ...shuffleVocabulary(distractors, random).slice(0, 3)], random);
}

export function arcadeDuration(index: number): number {
  return Math.max(8_000, 18_000 - Math.floor(index / 2) * 1_000);
}

export function rainHint(word: string, elapsedFraction: number): string {
  const letters = [...word].filter((letter) => /[\p{L}\p{N}]/u.test(letter)).length;
  const revealed = elapsedFraction >= 0.7 ? Math.ceil(letters / 2) : elapsedFraction >= 0.4 ? 1 : 0;
  let position = 0;
  return [...word].map((letter) => {
    if (!/[\p{L}\p{N}]/u.test(letter)) return letter;
    position++;
    return position <= revealed ? letter : "_";
  }).join("");
}

export function arcadePoints(mode: VocabularyArcadeMode, elapsedFraction: number, combo: number): number {
  if (mode === "blast") return 10;
  const base = elapsedFraction >= 0.7 ? 5 : elapsedFraction >= 0.4 ? 10 : 15;
  return base * Math.min(4, 1 + Math.floor(combo / 3));
}

export interface ArcadeState {
  mode: VocabularyArcadeMode;
  words: VocabWordCard[];
  options: VocabWordCard[][];
  index: number;
  phase: "playing" | "feedback";
  paused: boolean;
  untimed: boolean;
  elapsed: number;
  lives: number;
  combo: number;
  score: number;
  answers: VocabularyRoundAnswer[];
  disabled: number[];
  notice: string;
  lastCorrect: boolean;
}

export type ArcadeAction = { type: "tick"; delta: number } | { type: "answer"; value: string; optionId?: number } | { type: "pause"; paused: boolean } | { type: "next" };

export function createArcadeState(mode: VocabularyArcadeMode, source: VocabWordCard[], untimed = false): ArcadeState {
  const pool = arcadeWords(source);
  const words = shuffleVocabulary(pool).slice(0, 20);
  return { mode, words, options: words.map((word) => blastOptions(word, pool)), index: 0, phase: "playing", paused: false, untimed, elapsed: 0, lives: 3, combo: 0, score: 0, answers: [], disabled: [], notice: "", lastCorrect: false };
}

export function arcadeReducer(state: ArcadeState, action: ArcadeAction): ArcadeState {
  if (action.type === "pause") return { ...state, paused: action.paused };
  if (action.type === "next") {
    if (state.phase !== "feedback" || state.lives <= 0 || state.index + 1 >= state.words.length) return state;
    return { ...state, index: state.index + 1, phase: "playing", elapsed: 0, disabled: [], notice: "", lastCorrect: false };
  }
  if (state.phase !== "playing" || state.paused || state.lives <= 0) return state;
  const word = state.words[state.index];
  if (!word) return state;
  const duration = arcadeDuration(state.index);
  if (action.type === "tick") {
    if (state.untimed) return state;
    const elapsed = Math.min(duration, state.elapsed + Math.max(0, action.delta));
    if (elapsed < duration) return { ...state, elapsed };
    return { ...state, elapsed, lives: state.lives - 1, combo: 0, phase: "feedback", lastCorrect: false, notice: `Hết giờ. ${word.word} — ${word.meaning}`, answers: [...state.answers, { item: word, correct: false, selected: "Hết giờ", expected: word.word }] };
  }
  if (!action.value.trim()) return state;
  if (state.mode === "blast" && (action.optionId == null || state.disabled.includes(action.optionId) || !state.options[state.index].some((option) => option.id === action.optionId))) return state;
  const correct = state.mode === "blast" ? action.optionId === word.id : normalizeVocabularyAnswer(action.value) === normalizeVocabularyAnswer(word.word);
  const lives = state.lives - (!correct && state.mode === "blast" ? 1 : 0);
  const points = correct ? arcadePoints(state.mode, state.elapsed / duration, state.combo) : 0;
  return {
    ...state, lives, score: state.score + points, combo: correct ? state.combo + 1 : 0,
    answers: [...state.answers, { item: word, correct, selected: action.value, expected: word.word }],
    disabled: action.optionId != null && !correct ? [...state.disabled, action.optionId] : state.disabled,
    lastCorrect: correct,
    phase: correct || lives === 0 ? "feedback" : "playing",
    notice: correct ? `Chính xác! +${points} điểm` : lives === 0 ? `Hết mạng. ${word.word} — ${word.meaning}` : "Chưa khớp, thử lại nhé.",
  };
}
