import { normalizeSelectionWord, type SelectionDictionaryEntry } from "./selection-dictionary";

export const DICTIONARY_BASKET_EVENT = "englishweb:dictionary-basket-changed";
export type DictionaryWordContext = { id: string; title: string; sentence: string };
export type SavedDictionaryWord = { id: string; entry: SelectionDictionaryEntry; contexts: DictionaryWordContext[]; savedAt: string };
export type DictionaryBasketRead = { status: "ready" | "unavailable" | "corrupt"; items: SavedDictionaryWord[]; message: string };
export type DictionaryBasketSave = { status: "saved" | "duplicate" | "unavailable" | "corrupt" | "invalid"; count: number | null; message: string };
export const dictionaryBasketStorageKey = (learnerId: string) => `englishweb:dictionary-basket:v1:${learnerId}`;
const scalarFields = ["word", "lemma", "meaning", "partOfSpeech", "phonetic", "audioUrl", "phoneticUs", "phoneticUk", "audioUsUrl", "audioUkUrl", "example", "exampleTranslation", "source"] as const;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function validEntry(value: unknown): value is SelectionDictionaryEntry {
  if (!record(value) || !scalarFields.every((field) => typeof value[field] === "string") || !(value.word as string).trim() || !(value.meaning as string).trim()) return false;
  for (const field of ["phrases", "synonyms", "antonyms"] as const) {
    const rows = value[field];
    if (!Array.isArray(rows) || !rows.every((row) => record(row) && typeof row.text === "string" && typeof row.meaning === "string")) return false;
  }
  return Array.isArray(value.wordFamily) && value.wordFamily.every((row) => record(row) && typeof row.word === "string" && typeof row.meaning === "string" && typeof row.partOfSpeech === "string");
}
function validContext(value: unknown): value is DictionaryWordContext {
  return record(value) && ["id", "title", "sentence"].every((field) => typeof value[field] === "string");
}
function copyEntry(entry: SelectionDictionaryEntry): SelectionDictionaryEntry {
  return { ...Object.fromEntries(scalarFields.map((field) => [field, entry[field]])),
    phrases: entry.phrases.map(({ text, meaning }) => ({ text, meaning })), synonyms: entry.synonyms.map(({ text, meaning }) => ({ text, meaning })),
    antonyms: entry.antonyms.map(({ text, meaning }) => ({ text, meaning })), wordFamily: entry.wordFamily.map(({ word, meaning, partOfSpeech }) => ({ word, meaning, partOfSpeech })) } as SelectionDictionaryEntry;
}
export function loadDictionaryBasket(learnerId: string): DictionaryBasketRead {
  let raw;
  try { raw = localStorage.getItem(dictionaryBasketStorageKey(learnerId)); }
  catch { return { status: "unavailable", items: [], message: "Không thể đọc giỏ từ trên thiết bị này." }; }
  if (!raw) return { status: "ready", items: [], message: "Lưu trên thiết bị này" };
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || !Array.isArray(value.items)) throw new Error("Invalid basket");
    const ids = new Set<string>();
    for (const item of value.items) {
      if (!record(item) || typeof item.id !== "string" || !validEntry(item.entry) || item.id !== normalizeSelectionWord(item.entry.word) || ids.has(item.id)
        || typeof item.savedAt !== "string" || !Number.isFinite(Date.parse(item.savedAt)) || !Array.isArray(item.contexts) || !item.contexts.every(validContext)) throw new Error("Invalid basket item");
      ids.add(item.id);
    }
    return { status: "ready", items: value.items as SavedDictionaryWord[], message: "Lưu trên thiết bị này" };
  } catch { return { status: "corrupt", items: [], message: "Giỏ từ trên thiết bị này có dữ liệu không hợp lệ; dữ liệu cũ được giữ nguyên." }; }
}
export function saveDictionaryWord(learnerId: string, entry: SelectionDictionaryEntry, context: DictionaryWordContext): DictionaryBasketSave {
  if (!learnerId.trim() || !validEntry(entry) || !validContext(context)) return { status: "invalid", count: null, message: "Chưa có mục từ hợp lệ để lưu." };
  const basket = loadDictionaryBasket(learnerId);
  if (basket.status !== "ready") return { status: basket.status, count: null, message: basket.message };
  const id = normalizeSelectionWord(entry.word);
  if (!id) return { status: "invalid", count: null, message: "Chưa có mục từ hợp lệ để lưu." };
  const items = structuredClone(basket.items);
  const existing = items.find((item) => item.id === id);
  const savedContext = { id: context.id, title: context.title, sentence: context.sentence };
  if (existing) {
    if (!existing.contexts.some((row) => row.id === context.id && row.sentence === context.sentence)) existing.contexts.push(savedContext);
  } else items.push({ id, entry: copyEntry(entry), contexts: [savedContext], savedAt: new Date().toISOString() });
  try { localStorage.setItem(dictionaryBasketStorageKey(learnerId), JSON.stringify({ version: 1, items })); }
  catch { return { status: "unavailable", count: basket.items.length, message: "Không thể lưu giỏ từ trên thiết bị này. Mục từ chưa được thêm." }; }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(DICTIONARY_BASKET_EVENT, { detail: { learnerId } }));
  return { status: existing ? "duplicate" : "saved", count: items.length, message: existing ? "Từ này đã có trong giỏ. Đã lưu thêm nguồn câu nếu có." : "Đã thêm thẻ vào giỏ. Lưu trên thiết bị này." };
}
