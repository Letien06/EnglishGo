import { beforeEach, describe, expect, it, vi } from "vitest";
import { DICTIONARY_BASKET_EVENT, dictionaryBasketStorageKey, loadDictionaryBasket, saveDictionaryWord } from "./dictionary-word-basket";
import type { SelectionDictionaryEntry } from "./selection-dictionary";

export function dictionaryEntry(word = "work"): SelectionDictionaryEntry {
  return { word, lemma: word, meaning: "làm việc", partOfSpeech: "verb", phonetic: "/wɜːk/", audioUrl: "", phoneticUs: "/wɝːk/", phoneticUk: "/wɜːk/", audioUsUrl: "https://media.example.test/work.mp3", audioUkUrl: "", example: "I work here.", exampleTranslation: "Tôi làm việc ở đây.", phrases: [{ text: "work hard", meaning: "làm việc chăm chỉ" }], synonyms: [{ text: "labor", meaning: "lao động" }], antonyms: [], wordFamily: [{ word: "worker", meaning: "người lao động", partOfSpeech: "noun" }], source: "licensed-vocabulary" };
}
const context = { id: "question-1", title: "Động từ", sentence: "She works here." };
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe("device-local dictionary word basket", () => {
  it("saves the complete verified entry and source context only for the current learner", () => {
    const event = vi.fn(); window.addEventListener(DICTIONARY_BASKET_EVENT, event);
    const entry = dictionaryEntry();
    expect(saveDictionaryWord("alice", entry, context)).toMatchObject({ status: "saved", count: 1 });
    expect(loadDictionaryBasket("alice").items[0]).toMatchObject({ id: "work", entry, contexts: [context] });
    expect(loadDictionaryBasket("bob").items).toEqual([]);
    expect(event).toHaveBeenCalledTimes(1);
    window.removeEventListener(DICTIONARY_BASKET_EVENT, event);
  });
  it("deduplicates normalized words while retaining multiple original sentence contexts", () => {
    saveDictionaryWord("alice", dictionaryEntry("Work"), context);
    expect(saveDictionaryWord("alice", dictionaryEntry(" work "), { ...context, id: "question-2", sentence: "They work together." })).toMatchObject({ status: "duplicate", count: 1 });
    saveDictionaryWord("alice", dictionaryEntry("WORK"), context);
    expect(loadDictionaryBasket("alice").items[0].contexts).toEqual([context, { ...context, id: "question-2", sentence: "They work together." }]);
  });
  it("reports corrupt storage without overwriting the saved data", () => {
    const raw = "{invalid-json"; localStorage.setItem(dictionaryBasketStorageKey("alice"), raw);
    expect(saveDictionaryWord("alice", dictionaryEntry(), context)).toMatchObject({ status: "corrupt", count: null });
    expect(localStorage.getItem(dictionaryBasketStorageKey("alice"))).toBe(raw);
  });
  it("reports unavailable writes without claiming the word was saved", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    expect(saveDictionaryWord("alice", dictionaryEntry(), context)).toMatchObject({ status: "unavailable", count: 0 });
    expect(loadDictionaryBasket("alice").items).toEqual([]);
  });
  it("rejects an entry lacking a verified meaning and reports unavailable reads", () => {
    expect(saveDictionaryWord("alice", { ...dictionaryEntry(), meaning: "" }, context).status).toBe("invalid");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage denied"); });
    expect(loadDictionaryBasket("alice").status).toBe("unavailable");
  });
});
