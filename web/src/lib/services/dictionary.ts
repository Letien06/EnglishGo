/**
 * Dictionary vocabulary verification service.
 * Port of `service/DictionaryVocabularyService.java`.
 *
 * Looks up words in the free dictionary API, enriches with Gemini
 * translations and example generation.
 */
import type { AiVocabCandidate } from "@/types/vocab";
import {
  translateDictionaryDefinitions,
  generateDictionaryExamples,
  type DictionaryDefinitionForTranslation,
  type DictionaryExampleRequest,
} from "./gemini";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DictionaryEntry {
  word: string;
  partOfSpeech: string;
  phonetic: string;
  definition: string;
  example?: string;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Look up suggested words in the free dictionary, translate meanings
 * via Gemini, and generate missing examples.
 */
export async function enrichWithDictionary(
  suggestedWords: string[],
  count: number,
): Promise<AiVocabCandidate[]> {
  const unique = uniqueWords(suggestedWords);

  // Look up each word in the dictionary
  const entries: DictionaryEntry[] = [];
  for (const word of unique) {
    if (entries.length >= count) break;
    const entry = await lookup(word);
    if (entry) {
      entries.push(entry);
    }
  }

  if (entries.length === 0) return [];

  // Translate definitions to Vietnamese via Gemini
  const translations = await translateMeanings(entries);

  // Generate missing examples via Gemini
  const generatedExamples = await generateMissingExamples(
    entries,
    translations,
  );

  return entries.map((entry) => ({
    word: entry.word,
    meaning: translations[entry.word] ?? entry.definition,
    partOfSpeech: entry.partOfSpeech,
    phonetic: entry.phonetic || undefined,
    example: exampleFor(entry, generatedExamples),
    selected: true,
  }));
}

/* ------------------------------------------------------------------ */
/*  Dictionary API                                                     */
/* ------------------------------------------------------------------ */

async function lookup(word: string): Promise<DictionaryEntry | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase().trim())}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) return null;
    return parseEntry(json[0]);
  } catch {
    return null;
  }
}

function parseEntry(
  response: Record<string, unknown>,
): DictionaryEntry | null {
  const word = String(response.word ?? "").trim();
  if (!word) return null;

  const meanings = response.meanings as Array<Record<string, unknown>> | undefined;
  const defPick = firstDefinition(meanings);
  if (!defPick) return null;

  const phonetics = response.phonetics as Array<Record<string, unknown>> | undefined;

  return {
    word,
    partOfSpeech: normalizePartOfSpeech(defPick.partOfSpeech),
    phonetic: firstPhonetic(phonetics),
    definition: defPick.definition,
    example: defPick.example,
  };
}

interface DefinitionPick {
  partOfSpeech: string;
  definition: string;
  example?: string;
}

function firstDefinition(
  meanings?: Array<Record<string, unknown>>,
): DefinitionPick | null {
  if (!meanings || meanings.length === 0) return null;

  for (const meaning of meanings) {
    const defs = meaning.definitions as
      | Array<Record<string, unknown>>
      | undefined;
    if (!defs || defs.length === 0) continue;
    const def = defs[0];
    const definition = String(def.definition ?? "").trim();
    if (!definition) continue;
    return {
      partOfSpeech: String(meaning.partOfSpeech ?? "other"),
      definition,
      example: def.example ? String(def.example).trim() : undefined,
    };
  }
  return null;
}

function firstPhonetic(
  phonetics?: Array<Record<string, unknown>>,
): string {
  if (!phonetics) return "";
  for (const p of phonetics) {
    const text = String(p.text ?? "").trim();
    if (text) return text;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/*  Gemini integration                                                 */
/* ------------------------------------------------------------------ */

async function translateMeanings(
  entries: DictionaryEntry[],
): Promise<Record<string, string>> {
  const defs: DictionaryDefinitionForTranslation[] = entries.map(
    (entry) => ({
      word: entry.word,
      partOfSpeech: entry.partOfSpeech,
      definition: entry.definition,
    }),
  );
  try {
    return await translateDictionaryDefinitions(defs);
  } catch {
    // Fallback: use raw English definitions
    const result: Record<string, string> = {};
    for (const entry of entries) {
      result[entry.word] = entry.definition;
    }
    return result;
  }
}

async function generateMissingExamples(
  entries: DictionaryEntry[],
  translations: Record<string, string>,
): Promise<Record<string, string>> {
  const needExamples = entries.filter(
    (e) => !isUsableExample(e.example, e.word),
  );
  if (needExamples.length === 0) return {};

  const requests: DictionaryExampleRequest[] = needExamples.map(
    (entry) => ({
      word: entry.word,
      partOfSpeech: entry.partOfSpeech,
      meaning: translations[entry.word] ?? entry.definition,
    }),
  );

  try {
    return await generateDictionaryExamples(requests);
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function exampleFor(
  entry: DictionaryEntry,
  generatedExamples: Record<string, string>,
): string {
  if (isUsableExample(entry.example, entry.word)) {
    return cleanExample(entry.example!, entry.word);
  }
  const generated = generatedExamples[entry.word];
  if (generated && isUsableExample(generated, entry.word)) {
    return cleanExample(generated, entry.word);
  }
  return fallbackExample(entry.word, entry.partOfSpeech);
}

function cleanExample(value: string, word: string): string {
  let cleaned = value.trim();
  // Remove leading quotes
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  // Ensure ends with period
  if (!/[.!?]$/.test(cleaned)) {
    cleaned += ".";
  }
  return cleaned;
}

function isUsableExample(
  example: string | undefined,
  word: string,
): boolean {
  if (!example || example.trim().length < 10) return false;
  const lower = example.toLowerCase();
  const wordLower = word.toLowerCase();
  // Must contain the word (or word stem)
  return lower.includes(wordLower);
}

function fallbackExample(word: string, partOfSpeech: string): string {
  const w = word.charAt(0).toUpperCase() + word.slice(1);
  switch (partOfSpeech) {
    case "VERB":
      return `We need to ${word} the documents before the deadline.`;
    case "ADJ":
      return `The ${word} report was submitted on time.`;
    case "ADV":
      return `The team worked ${word} to meet the target.`;
    default:
      return `${w} is an important concept in business communication.`;
  }
}

function uniqueWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    const normalized = word.trim().toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizePartOfSpeech(value: string): string {
  const lower = value.toLowerCase().trim();
  switch (lower) {
    case "noun":
      return "NOUN";
    case "verb":
      return "VERB";
    case "adjective":
    case "adj":
      return "ADJ";
    case "adverb":
    case "adv":
      return "ADV";
    default:
      return "OTHER";
  }
}
