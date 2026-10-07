import { decodeHTML } from "entities";

export type VocabularyEntry = {
  id: string;
  word: string;
  meaning: string;
  partOfSpeech: string | undefined;
  level: string | undefined;
  raw: string;
};

/** Explicit TSV prevents punctuation inside meanings from changing column boundaries. */
export function vocabularyRowsText(entries: Pick<VocabularyEntry, "word" | "meaning">[]): string {
  const cell = (value: string) => value.replace(/[\r\n\t]+/g, " ").trim();
  return ["word\tmeaning", ...entries.map((entry) => `${cell(entry.word)}\t${cell(entry.meaning)}`)].join("\n");
}

function text(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeHTML(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/(?:p|div|li)>/gi, "\n")
    .replace(/<\/?[a-z][a-z0-9]*(?:\s+[a-z_:][a-z0-9_:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/gi, "")
    .trim();
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function id(word: string, index: number): string {
  return `${word.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`;
}

function details(value: unknown, family = false): string {
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => {
    if (typeof entry === "string") return text(entry);
    const item = record(entry);
    if (!item) return "";
    const english = text(family ? item.word : item.en);
    const vietnamese = text(item.vi);
    const pos = family ? text(item.pos) : "";
    return [english && `${english}${pos ? ` (${pos})` : ""}`, vietnamese].filter(Boolean).join(": ");
  }).filter(Boolean).join("; ");
}

function structuredEntry(value: unknown, index: number): VocabularyEntry | null {
  const item = record(value);
  if (!item) return null;
  const word = text(item.word);
  const meaning = text(item.meaning_vi);
  if (!word || !meaning) return null;
  const partOfSpeech = text(item.pos) || undefined;
  const level = text(item.cefr) || undefined;
  const labels: [string, string][] = [
    ["Từ gốc", text(item.lemma)], ["IPA (Mỹ)", text(item.ipa_us)], ["IPA (Anh)", text(item.ipa_uk)],
    ["Ví dụ (Anh)", text(item.example_en)], ["Ví dụ (Việt)", text(item.example_vi)],
    ["Cụm từ thường dùng", details(item.collocations)], ["Từ đồng nghĩa", details(item.synonym)],
    ["Từ trái nghĩa", details(item.antonym)], ["Họ từ", details(item.word_family, true)],
  ];
  const raw = [
    `${word}${partOfSpeech ? ` (${partOfSpeech})` : ""}: ${meaning}`,
    ...(level ? [`Trình độ: ${level}`] : []),
    ...labels.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
  return { id: id(word, index), word, meaning, partOfSpeech, level, raw };
}

export function parseVocabularyEntries(value: string): VocabularyEntry[] {
  const source = value.trim();
  if (!source) return [];
  if (/^[\[{\"]/.test(source)) {
    try {
      const parsed: unknown = JSON.parse(source);
      const entries = Array.isArray(parsed) ? parsed : record(parsed)?.vocabulary;
      if (!Array.isArray(entries)) return [];
      return entries.map(structuredEntry).filter((entry): entry is VocabularyEntry => entry !== null);
    } catch {
      return [];
    }
  }

  return text(source).replace(/\r/g, "\n").split(/\n+|;+/g)
    .map((part) => part.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .map((raw, index): VocabularyEntry | null => {
      const colon = raw.match(/^(.+?)(?:\s*[:：–-]\s+)(.+)$/);
      const compact = raw.match(/^([A-Za-z][A-Za-z'’\-\s]*?)(?:\s*\(([^)]+)\))?\s+(.+)$/);
      let word = colon?.[1] ?? compact?.[1] ?? raw.split(/\s+/)[0];
      let partOfSpeech = compact?.[2] || undefined;
      const wordPos = word.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (wordPos) { word = wordPos[1].trim(); partOfSpeech = wordPos[2].trim(); }
      let meaning = (colon?.[2] ?? compact?.[3] ?? raw.slice(word.length)).trim();
      let level: string | undefined;
      const levelMatch = meaning.match(/^(A1|A2|B1|B2|C1|C2)\s+(.+)$/i);
      if (levelMatch) { level = levelMatch[1].toUpperCase(); meaning = levelMatch[2].trim(); }
      if (!word || !meaning) return null;
      return { id: id(word, index), word, meaning, partOfSpeech, level, raw };
    }).filter((entry): entry is VocabularyEntry => entry !== null);
}
