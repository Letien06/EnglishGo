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
  phoneticUs: string;
  phoneticUk: string;
  audioUrl: string;
  audioUsUrl: string;
  audioUkUrl: string;
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
  // Dictionary requests are independent. A small concurrency cap keeps the
  // preview responsive without overwhelming the public dictionary service.
  const lookedUp = await mapWithConcurrency(
    unique.slice(0, count),
    8,
    lookup,
  );
  const entries = lookedUp.filter((entry): entry is DictionaryEntry => entry !== null);

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
    phoneticUs: entry.phoneticUs || undefined,
    phoneticUk: entry.phoneticUk || undefined,
    audioUrl: entry.audioUrl || undefined,
    audioUsUrl: entry.audioUsUrl || undefined,
    audioUkUrl: entry.audioUkUrl || undefined,
    example: exampleFor(entry, generatedExamples),
    selected: true,
  }));
}

export async function enrichCandidatePronunciation(
  candidate: AiVocabCandidate,
): Promise<AiVocabCandidate> {
  const lookupWord = cleanLookupWord(candidate.word);
  if (!lookupWord) return candidate;
  const entry = await lookup(lookupWord);
  if (!entry) {
    return {
      ...candidate,
      word: lookupWord,
    };
  }

  return {
    ...candidate,
    word: entry.word || lookupWord,
    partOfSpeech:
      !candidate.partOfSpeech || candidate.partOfSpeech === "OTHER"
        ? entry.partOfSpeech
        : candidate.partOfSpeech,
    phonetic: candidate.phonetic || entry.phonetic || undefined,
    phoneticUs: candidate.phoneticUs || entry.phoneticUs || undefined,
    phoneticUk: candidate.phoneticUk || entry.phoneticUk || undefined,
    audioUrl: candidate.audioUrl || entry.audioUrl || undefined,
    audioUsUrl: candidate.audioUsUrl || entry.audioUsUrl || undefined,
    audioUkUrl: candidate.audioUkUrl || entry.audioUkUrl || undefined,
    example: candidate.example || entry.example || undefined,
  };
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
  const pronunciation = pronunciationFor(phonetics);

  return {
    word,
    partOfSpeech: normalizePartOfSpeech(defPick.partOfSpeech),
    phonetic: pronunciation.phonetic,
    phoneticUs: pronunciation.phoneticUs,
    phoneticUk: pronunciation.phoneticUk,
    audioUrl: pronunciation.audioUrl,
    audioUsUrl: pronunciation.audioUsUrl,
    audioUkUrl: pronunciation.audioUkUrl,
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

interface PronunciationPick {
  phonetic: string;
  phoneticUs: string;
  phoneticUk: string;
  audioUrl: string;
  audioUsUrl: string;
  audioUkUrl: string;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

function pronunciationFor(
  phonetics?: Array<Record<string, unknown>>,
): PronunciationPick {
  const result: PronunciationPick = {
    phonetic: "",
    phoneticUs: "",
    phoneticUk: "",
    audioUrl: "",
    audioUsUrl: "",
    audioUkUrl: "",
  };
  if (!phonetics) return result;

  for (const p of phonetics) {
    const text = String(p.text ?? "").trim();
    const audio = String(p.audio ?? "").trim();
    const sourceUrl = String(p.sourceUrl ?? "").trim();
    const licenseName = String((p.license as Record<string, unknown> | undefined)?.name ?? "").trim();
    const accent = inferAccent(`${audio} ${sourceUrl} ${licenseName}`);

    if (text && !result.phonetic) result.phonetic = text;
    if (audio && !result.audioUrl) result.audioUrl = audio;

    if (accent === "us") {
      if (text && !result.phoneticUs) result.phoneticUs = text;
      if (audio && !result.audioUsUrl) result.audioUsUrl = audio;
    }
    if (accent === "uk") {
      if (text && !result.phoneticUk) result.phoneticUk = text;
      if (audio && !result.audioUkUrl) result.audioUkUrl = audio;
    }
  }

  result.phoneticUs ||= result.phonetic;
  result.phoneticUk ||= result.phonetic;
  result.audioUrl ||= result.audioUsUrl || result.audioUkUrl;
  return result;
}

function inferAccent(value: string): "us" | "uk" | null {
  const lower = value.toLowerCase();
  if (/(^|[^a-z])(us|usa|american|en-us)([^a-z]|$)/.test(lower)) return "us";
  if (/(^|[^a-z])(uk|gb|british|en-gb)([^a-z]|$)/.test(lower)) return "uk";
  if (lower.includes("-us.") || lower.includes("_us.")) return "us";
  if (lower.includes("-uk.") || lower.includes("_uk.")) return "uk";
  return null;
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
    return cleanExample(entry.example!);
  }
  const generated = generatedExamples[entry.word];
  if (generated && isUsableExample(generated, entry.word)) {
    return cleanExample(generated);
  }
  return fallbackExample(entry.word, entry.partOfSpeech);
}

function cleanExample(value: string): string {
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
    const normalized = cleanLookupWord(word).toLowerCase();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function cleanLookupWord(value: string): string {
  return value
    .trim()
    .replace(/\s*\((?:n|noun|v|verb|adj|adjective|adv|adverb|prep|preposition)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
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
