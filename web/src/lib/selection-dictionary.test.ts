import { describe, expect, it } from "vitest";
import { buildSelectionDictionaryIndex, dictionaryFallbackEntry, isDictionarySelection, lookupSelectionDictionary, normalizeSelectionWord, parseSelectionVocabulary } from "./selection-dictionary";

const licensed = {
  word: "revisions", lemma: "revision", meaning_vi: "sự sửa đổi", pos: "n", ipa_us: "rɪˈvɪʒən", ipa_uk: "rɪˈvɪʒn",
  example_en: "Make revisions.", example_vi: "Thực hiện sửa đổi.", collocations: [{ en: "minor revisions", vi: "sửa đổi nhỏ" }],
  synonym: [{ en: "amendment", vi: "sự sửa đổi" }], antonym: [{ en: "original", vi: "bản gốc" }], word_family: [{ word: "revise", pos: "v", vi: "sửa đổi" }],
};
describe("verified selection dictionary", () => {
  it.each([licensed, [licensed], { vocabulary: [licensed] }, JSON.stringify({ vocabulary: [licensed] })])("preserves licensed dictionary detail", value => {
    const [entry] = parseSelectionVocabulary(value);
    expect(entry).toMatchObject({ word: "revisions", lemma: "revision", meaning: "sự sửa đổi", partOfSpeech: "n", phoneticUs: licensed.ipa_us, phoneticUk: licensed.ipa_uk, example: licensed.example_en, exampleTranslation: licensed.example_vi, phrases: [{ text: "minor revisions", meaning: "sửa đổi nhỏ" }], synonyms: [{ text: "amendment", meaning: "sự sửa đổi" }], antonyms: [{ text: "original", meaning: "bản gốc" }], wordFamily: [{ word: "revise", meaning: "sửa đổi", partOfSpeech: "v" }] });
  });
  it("accepts legacy text but rejects malformed and unverified definitions", () => {
    expect(parseSelectionVocabulary("service (n): dịch vụ; happy (adj) vui vẻ")).toMatchObject([{ word: "service", meaning: "dịch vụ", partOfSpeech: "n" }, { word: "happy", meaning: "vui vẻ" }]);
    for (const value of [null, 5, '{"vocabulary":', { unknown: [licensed] }, [{ word: "made-up" }, { word: {}, meaning_vi: "x" }]]) expect(parseSelectionVocabulary(value)).toEqual([]);
  });
  it("prefers current question definitions and exact phrases without substring guessing", () => {
    const index = buildSelectionDictionaryIndex([{ word: "bank", meaning_vi: "bờ sông" }, { word: "wait in line", meaning_vi: "xếp hàng" }], [[{ word: "bank", meaning_vi: "ngân hàng" }, { word: "line", meaning_vi: "dòng" }]]);
    expect(lookupSelectionDictionary("bank", index)).toMatchObject({ scope: "question", match: "exact", entry: { meaning: "bờ sông" } });
    expect(lookupSelectionDictionary("WAIT IN LINE", index)).toMatchObject({ match: "exact", entry: { word: "wait in line" } });
    expect(lookupSelectionDictionary("line", index)).toMatchObject({ scope: "topic", entry: { word: "line" } });
    expect(lookupSelectionDictionary("online", index)).toBeNull();
  });
  it("matches explicit lemmas, family forms and inflections while keeping their source meanings distinct", () => {
    const index = buildSelectionDictionaryIndex({ vocabulary: [licensed] }, []);
    expect(lookupSelectionDictionary("revision", index)).toMatchObject({ match: "lemma", matchedWord: "revision", entry: { word: "revisions", meaning: "sự sửa đổi" } });
    expect(lookupSelectionDictionary("revise", index)).toMatchObject({ match: "family", family: { word: "revise", meaning: "sửa đổi", partOfSpeech: "v" } });
    expect(lookupSelectionDictionary("revised", index)).toMatchObject({ match: "inflection", family: { word: "revise", meaning: "sửa đổi" } });
    const growing = buildSelectionDictionaryIndex({ word: "growth", meaning_vi: "sự tăng trưởng", word_family: [{ word: "grow", vi: "tăng trưởng", pos: "v" }] }, []);
    expect(lookupSelectionDictionary("grown", growing)).toMatchObject({ match: "inflection", family: { word: "grow", meaning: "tăng trưởng" }, entry: { meaning: "sự tăng trưởng" } });
  });
  it("normalizes apostrophes/case and refuses unsupported paragraphs or ambiguous news stemming", () => {
    expect(normalizeSelectionWord("  Employer’s   policy ")).toBe("employer's policy");
    const index = buildSelectionDictionaryIndex([{ word: "employer's policy", meaning_vi: "chính sách của người sử dụng lao động" }, { word: "new", meaning_vi: "mới" }], []);
    expect(lookupSelectionDictionary("EMPLOYER’S POLICY", index)?.match).toBe("exact");
    expect(lookupSelectionDictionary("news", index)).toBeNull();
    for (const text of ["six separate English words selected at once", "<script>x</script>", "word?", "x".repeat(80), "", "123"]) expect(isDictionarySelection(text)).toBe(false);
  });
  it("supports API fallback without pretending generic phonetics have a US/UK accent", () => {
    const entry = dictionaryFallbackEntry({ success: true, data: { word: "online", meaning: "trực tuyến", phonetic: "/ˌɒnˈlaɪn/", partOfSpeech: "adjective", example: "An online course.", source: "Free Dictionary API" } });
    expect(entry).toMatchObject({ word: "online", meaning: "trực tuyến", phonetic: "/ˌɒnˈlaɪn/", phoneticUs: "", phoneticUk: "", source: "Free Dictionary API" });
    expect(dictionaryFallbackEntry({ success: false, data: { word: "online", meaning: "x" } })).toBeNull();
  });
  it("strips active markup and rejects unsafe audio URLs", () => {
    const [entry] = parseSelectionVocabulary({ word: "&lt;b&gt;service&lt;/b&gt;", meaning_vi: "dịch vụ &amp; hỗ trợ", example_en: "<script>bad()</script>Help", audioUsUrl: "javascript:bad()", audioUkUrl: "https://example.com/uk.mp3" });
    expect(entry).toMatchObject({ word: "service", meaning: "dịch vụ & hỗ trợ", example: "Help", audioUsUrl: "", audioUkUrl: "https://example.com/uk.mp3" });
  });
});
