import { decodeHTML } from "entities";
import { parseVocabularyEntries } from "./practice-vocabulary";

export type SelectionDictionaryRelated = { text: string; meaning: string };
export type SelectionDictionaryFamily = { word: string; meaning: string; partOfSpeech: string };
export type SelectionDictionaryEntry = {
  word: string; lemma: string; meaning: string; partOfSpeech: string;
  phonetic: string; phoneticUs: string; phoneticUk: string;
  audioUrl: string; audioUsUrl: string; audioUkUrl: string;
  example: string; exampleTranslation: string;
  phrases: SelectionDictionaryRelated[]; synonyms: SelectionDictionaryRelated[]; antonyms: SelectionDictionaryRelated[];
  wordFamily: SelectionDictionaryFamily[]; source: string;
};
export type SelectionDictionaryIndex = { question: SelectionDictionaryEntry[]; topic: SelectionDictionaryEntry[] };
export type SelectionDictionaryMatch = {
  entry: SelectionDictionaryEntry; scope: "question" | "topic" | "library";
  match: "exact" | "lemma" | "family" | "inflection";
  matchedWord: string; family?: SelectionDictionaryFamily;
};

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function text(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeHTML(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\s*\/(?:p|div|li)>/gi, "\n")
    .replace(/<\/?[a-z][a-z0-9]*(?:\s+[a-z_:][a-z0-9_:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/gi, "").trim();
}
function firstText(...values: unknown[]) { return values.map(text).find(Boolean) ?? ""; }
function audio(value: unknown): string {
  const url = text(value);
  try { return /^https?:$/.test(new URL(url).protocol) ? url : ""; } catch { return ""; }
}
export function normalizeSelectionWord(value: string): string {
  return value.replace(/[‘’]/g, "'").replace(/[‐‑]/g, "-").trim().replace(/\s+/g, " ").toLowerCase();
}
export function isDictionarySelection(value: string): boolean {
  const normalized = normalizeSelectionWord(value);
  return value.trim().length <= 79 && /^[a-z][a-z'-]*(?: [a-z][a-z'-]*){0,4}$/.test(normalized);
}
function related(value: unknown): SelectionDictionaryRelated[] {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.flatMap(value => {
    if (typeof value === "string") return text(value) ? [{ text: text(value), meaning: "" }] : [];
    const item = record(value);
    if (!item) return [];
    const label = firstText(item.en, item.text, item.phrase, item.word);
    return label ? [{ text: label, meaning: firstText(item.vi, item.meaning, item.meaning_vi) }] : [];
  });
}
function family(value: unknown): SelectionDictionaryFamily[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(value => {
    const item = record(value);
    const word = text(item?.word);
    return word ? [{ word, meaning: firstText(item?.vi, item?.meaning, item?.meaning_vi), partOfSpeech: firstText(item?.pos, item?.partOfSpeech) }] : [];
  });
}
function entry(value: unknown, defaultSource = "Từ vựng bài học"): SelectionDictionaryEntry | null {
  const item = record(value);
  if (!item) return null;
  const word = text(item.word);
  const meaning = firstText(item.meaning_vi, item.meaning, item.meaningVi);
  if (!word || !meaning) return null;
  return {
    word, lemma: firstText(item.lemma) || word, meaning, partOfSpeech: firstText(item.pos, item.partOfSpeech),
    phonetic: text(item.phonetic), phoneticUs: firstText(item.ipa_us, item.phoneticUs, item.ipaUs), phoneticUk: firstText(item.ipa_uk, item.phoneticUk, item.ipaUk),
    audioUrl: audio(item.audioUrl ?? item.audio_url), audioUsUrl: audio(item.audioUsUrl ?? item.audio_us ?? item.audio_us_url), audioUkUrl: audio(item.audioUkUrl ?? item.audio_uk ?? item.audio_uk_url),
    example: firstText(item.example_en, item.example), exampleTranslation: firstText(item.example_vi, item.exampleTranslation),
    phrases: related(item.collocations ?? item.phrases), synonyms: related(item.synonym ?? item.synonyms), antonyms: related(item.antonym ?? item.antonyms),
    wordFamily: family(item.word_family ?? item.wordFamily), source: text(item.source) || defaultSource,
  };
}

/** Decode licensed source vocabulary without synthesizing missing definitions. */
export function parseSelectionVocabulary(payload: unknown): SelectionDictionaryEntry[] {
  if (typeof payload === "string") {
    const value = payload.trim();
    if (!value) return [];
    if (/^[\[{\"]/.test(value)) {
      try { return parseSelectionVocabulary(JSON.parse(value)); } catch { return []; }
    }
    return parseVocabularyEntries(value).flatMap(value => {
      const parsed = entry(value);
      return parsed ? [parsed] : [];
    });
  }
  const container = record(payload);
  const values = Array.isArray(payload) ? payload : Array.isArray(container?.vocabulary) ? container.vocabulary : container?.word ? [container] : [];
  return values.flatMap(value => { const parsed = entry(value); return parsed ? [parsed] : []; });
}

function deduplicate(entries: SelectionDictionaryEntry[]): SelectionDictionaryEntry[] {
  const seen = new Set<string>();
  return entries.filter(entry => {
    const signature = JSON.stringify([normalizeSelectionWord(entry.word), entry.lemma, entry.meaning, entry.partOfSpeech, entry.example]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
export function buildSelectionDictionaryIndex(currentPayload: unknown, topicPayloads: readonly unknown[]): SelectionDictionaryIndex {
  return { question: deduplicate(parseSelectionVocabulary(currentPayload)), topic: deduplicate(topicPayloads.flatMap(parseSelectionVocabulary)) };
}

const irregular: Record<string, string> = {
  grew: "grow", grown: "grow", was: "be", were: "be", been: "be", has: "have", had: "have", did: "do", done: "do", went: "go", gone: "go",
  took: "take", taken: "take", made: "make", saw: "see", seen: "see", bought: "buy", brought: "bring", thought: "think", found: "find",
  gave: "give", given: "give", wrote: "write", written: "write", spoke: "speak", spoken: "speak", ate: "eat", eaten: "eat", ran: "run", came: "come",
  knew: "know", known: "know", got: "get", gotten: "get", left: "leave", felt: "feel", kept: "keep", held: "hold", told: "tell", sent: "send",
  built: "build", met: "meet", chose: "choose", chosen: "choose", drove: "drive", driven: "drive", lost: "lose", paid: "pay", sold: "sell", taught: "teach", caught: "catch", slept: "sleep",
};
function wordForms(word: string): Set<string> {
  const forms = new Set([word]);
  if (Object.prototype.hasOwnProperty.call(irregular, word)) forms.add(irregular[word]);
  if (word.endsWith("'s")) forms.add(word.slice(0, -2));
  if (word.endsWith("s'")) forms.add(word.slice(0, -1));
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word) && !["news", "series", "species", "means"].includes(word)) forms.add(word.slice(0, -1));
  if (word.length > 4 && word.endsWith("ies")) forms.add(`${word.slice(0, -3)}y`);
  if (word.length > 4 && /(ches|shes|sses|xes|zes|oes)$/.test(word)) forms.add(word.slice(0, -2));
  if (word.length > 4 && word.endsWith("ied")) forms.add(`${word.slice(0, -3)}y`);
  for (const suffix of ["ed", "ing"]) {
    if (word.length <= suffix.length + 2 || !word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    forms.add(stem); forms.add(`${stem}e`);
    if (/([^aeiou])\1$/.test(stem)) forms.add(stem.slice(0, -1));
  }
  return forms;
}
function forms(value: string): Set<string> {
  const words = value.split(" ");
  return new Set([...wordForms(words[0])].map(first => [first, ...words.slice(1)].join(" ")));
}

/** Scope wins before aliases: current-question meaning precedes topic meanings. */
export function lookupSelectionDictionary(selection: string, index: SelectionDictionaryIndex): SelectionDictionaryMatch | null {
  const normalized = normalizeSelectionWord(selection);
  if (!isDictionarySelection(selection)) return null;
  for (const scope of ["question", "topic"] as const) {
    const entries = index[scope];
    const exact = entries.find(entry => normalizeSelectionWord(entry.word) === normalized);
    if (exact) return { entry: exact, scope, match: "exact", matchedWord: exact.word };
    const lemma = entries.find(entry => normalizeSelectionWord(entry.lemma) === normalized);
    if (lemma) return { entry: lemma, scope, match: "lemma", matchedWord: lemma.lemma };
    for (const entry of entries) {
      const family = entry.wordFamily.find(form => normalizeSelectionWord(form.word) === normalized);
      if (family) return { entry, scope, match: "family", matchedWord: family.word, family };
    }
    const selectedForms = forms(normalized);
    for (const entry of entries) {
      for (const candidate of [entry.word, entry.lemma]) {
        const match = [...forms(normalizeSelectionWord(candidate))].some(form => selectedForms.has(form));
        if (match) return { entry, scope, match: "inflection", matchedWord: candidate };
      }
      const family = entry.wordFamily.find(form => [...forms(normalizeSelectionWord(form.word))].some(value => selectedForms.has(value)));
      if (family) return { entry, scope, match: "inflection", matchedWord: family.word, family };
    }
  }
  return null;
}

export function dictionaryFallbackEntry(payload: unknown): SelectionDictionaryEntry | null {
  const wrapper = record(payload);
  if (wrapper?.success === false) return null;
  return entry(wrapper?.data ?? payload, "Free Dictionary API");
}
