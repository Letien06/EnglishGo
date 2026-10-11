import { normalizeVocabularyAnswer } from "./vocab-content";
import { englishExampleForSpeech } from "./vocab-speech";
import type { VocabWordCard } from "@/types/vocab";

function normalizedMeaning(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function matchesVocabAnswer(input: string, expected: string, language: "english" | "meaning"): boolean {
  if (language === "english") {
    const actual = normalizeVocabularyAnswer(input);
    return Boolean(actual) && actual === normalizeVocabularyAnswer(expected);
  }
  const actual = normalizedMeaning(input);
  const target = normalizedMeaning(expected);
  return Boolean(actual) && (actual === target || meaningAlternatives(expected).includes(actual));
}

function meaningAlternatives(value: string): string[] {
  return value.split(/[;,/\n]/).map(normalizedMeaning).filter(Boolean);
}

function meaningsOverlap(left: string, right: string) {
  const meanings = new Set(meaningAlternatives(left));
  return meaningAlternatives(right).some((meaning) => meanings.has(meaning));
}

/** Exclude alternative senses of the same spelling and known equivalent meanings. */
export function quizDistractors(word: VocabWordCard, words: VocabWordCard[], mode: "wordMeaning" | "context" | "meaningWord"): string[] {
  const spelling = normalizeVocabularyAnswer(word.word);
  const synonyms = new Set((word.synonyms ?? []).map(normalizeVocabularyAnswer));
  const candidates = words.filter((candidate) => candidate.id !== word.id
    && normalizeVocabularyAnswer(candidate.word) !== spelling
    && !meaningsOverlap(candidate.meaning, word.meaning)
    && !synonyms.has(normalizeVocabularyAnswer(candidate.word))
    && !(candidate.synonyms ?? []).some((synonym) => normalizeVocabularyAnswer(synonym) === spelling));
  const values = uniqueQuizAnswers(candidates.map((candidate) => mode === "wordMeaning" ? candidate.meaning : candidate.word));
  return mode === "wordMeaning" ? values.filter((value, index) => !values.slice(0, index).some((earlier) => meaningsOverlap(value, earlier))) : values;
}

/** Keep visible answers unique, including case/spacing variants. */
export function uniqueQuizAnswers(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const key = normalizeVocabularyAnswer(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A context question must contain a whole target word/phrase to blank. */
export function quizContextPrompt(word: string, example?: string): string | null {
  const target = word.trim();
  if (!target || !example) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  const sentence = englishExampleForSpeech(example);
  if (!pattern.test(sentence)) return null;
  pattern.lastIndex = 0;
  return sentence.replace(pattern, "____");
}
