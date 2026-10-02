import type { VocabWordCard, VocabWordDetails } from "@/types/vocab";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 12) : [];
}

export function vocabularyDetails(value: Record<string, unknown>): VocabWordDetails {
  const phrases = Array.isArray(value.phrases) ? value.phrases.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const phrase = entry as Record<string, unknown>;
    const content = text(phrase.text ?? phrase.phrase);
    return content ? [{ text: content, meaning: text(phrase.meaning) }] : [];
  }).slice(0, 8) : [];
  const imageUrl = text(value.imageUrl);
  return {
    imageUrl: /^https:\/\//i.test(imageUrl) ? imageUrl : undefined,
    exampleTranslation: text(value.exampleTranslation) || undefined,
    phrases,
    synonyms: textList(value.synonyms),
    antonyms: textList(value.antonyms),
    wordFamily: textList(value.wordFamily),
    toeicTip: text(value.toeicTip) || undefined,
  };
}

export interface VocabularyStudyStep {
  kind: "word" | "phrase" | "example" | "typing";
  label: string;
  front: string;
  back: string;
}

export function vocabularyStudySteps(word: VocabWordCard): VocabularyStudyStep[] {
  const steps: VocabularyStudyStep[] = [{ kind: "word", label: "Từ", front: word.word, back: word.meaning }];
  for (const phrase of word.phrases ?? []) {
    if (phrase.meaning) steps.push({ kind: "phrase", label: "Cụm", front: phrase.text, back: phrase.meaning });
  }
  if (word.example) steps.push({ kind: "example", label: "Câu", front: word.example, back: word.exampleTranslation || word.meaning });
  steps.push({ kind: "typing", label: "Gõ từ", front: word.meaning, back: word.word });
  return steps;
}

export function normalizeVocabularyAnswer(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}
