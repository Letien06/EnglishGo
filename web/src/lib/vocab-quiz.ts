import { normalizeVocabularyAnswer } from "./vocab-content";
import { englishExampleForSpeech } from "./vocab-speech";

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
  return Boolean(actual) && (actual === target || (actual.length >= 3 && ` ${target} `.includes(` ${actual} `)));
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
