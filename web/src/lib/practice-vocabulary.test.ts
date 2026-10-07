import { describe, expect, it } from "vitest";
import { parseVocabularyEntries, vocabularyRowsText } from "./practice-vocabulary";
import { parseDelimitedWords } from "./parsers/vocab-import";

const entry = {
  word: "revisions", lemma: "revision", cefr: "B2", pos: "n", meaning_vi: "sự sửa đổi",
  ipa_us: "rɪˈvɪʒən", ipa_uk: "rɪˈvɪʒn", example_en: "Make revisions.", example_vi: "Thực hiện sửa đổi.",
  collocations: [{ en: "minor revisions", vi: "sửa đổi nhỏ" }], synonym: [{ en: "amendment", vi: "sự sửa đổi" }],
  antonym: [{ en: "original", vi: "bản gốc" }], word_family: [{ word: "revise", pos: "v", vi: "sửa đổi" }],
};

describe("practice vocabulary parsing", () => {
  it.each([undefined, 2])("parses compact and formatted source JSON (%s)", (indent) => {
    const [parsed] = parseVocabularyEntries(JSON.stringify({ vocabulary: [entry] }, null, indent));
    expect(parsed).toMatchObject({ word: "revisions", meaning: "sự sửa đổi", partOfSpeech: "n", level: "B2" });
    expect(parsed.raw).toContain("IPA (Mỹ): rɪˈvɪʒən");
    expect(parsed.raw).toContain("Ví dụ (Việt): Thực hiện sửa đổi.");
    expect(parsed.raw).toContain("Cụm từ thường dùng: minor revisions: sửa đổi nhỏ");
    expect(parsed.raw).toContain("Từ đồng nghĩa: amendment: sự sửa đổi");
    expect(parsed.raw).toContain("Từ trái nghĩa: original: bản gốc");
    expect(parsed.raw).toContain("Họ từ: revise (v): sửa đổi");
    expect(parsed.raw).not.toContain("meaning_vi");
  });
  it("accepts arrays while rejecting mixed invalid records and objects in text fields", () => {
    const parsed = parseVocabularyEntries(JSON.stringify([null, 42, {}, { word: "x" }, { word: {}, meaning_vi: "x" }, { ...entry, synonym: [{}], example_en: {} }]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].raw).not.toContain("[object Object]");
  });
  it.each(['{"vocabulary":', '{"unknown":[1]}', '["word: meaning"]', '"word: meaning"'])("rejects malformed or unsupported JSON: %s", (value) => {
    expect(parseVocabularyEntries(value)).toEqual([]);
  });
  it("preserves legacy list delimiters, POS, compact forms, and CEFR levels", () => {
    expect(parseVocabularyEntries("• service (n): B1 dịch vụ; happy (adj) vui vẻ\nwell-known – nổi tiếng")).toMatchObject([
      { word: "service", meaning: "dịch vụ", partOfSpeech: "n", level: "B1" },
      { word: "happy", meaning: "vui vẻ", partOfSpeech: "adj" },
      { word: "well-known", meaning: "nổi tiếng" },
    ]);
  });
  it("decodes entities and returns plain text without active HTML", () => {
    const [parsed] = parseVocabularyEntries(JSON.stringify([{ word: "&lt;b&gt;service&lt;/b&gt;", meaning_vi: "dịch vụ &amp; hỗ trợ", example_en: "<script>alert(1)</script><b>Help</b>" }]));
    expect(parsed.word).toBe("service");
    expect(parsed.meaning).toBe("dịch vụ & hỗ trợ");
    expect(parsed.raw).toContain("Ví dụ (Anh): Help");
    expect(parsed.raw).not.toContain("script");
  });
  it("preserves literal email brackets and mathematical comparisons in legacy text", () => {
    expect(parseVocabularyEntries("email: <name@example.com>\ncomparison: 2 < 3 and 5 > 4")).toMatchObject([
      { word: "email", meaning: "<name@example.com>" },
      { word: "comparison", meaning: "2 < 3 and 5 > 4" },
    ]);
  });
  it("round trips a selected subset through the real vocabulary importer with punctuation intact", () => {
    const entries = [
      { word: "ignored", meaning: "không chọn" },
      { word: "storage", meaning: "sự lưu trữ; bảo quản, kho | dữ liệu" },
    ];
    const selected = entries.filter((entry) => entry.word === "storage");
    expect(vocabularyRowsText(selected)).toBe("word\tmeaning\nstorage\tsự lưu trữ; bảo quản, kho | dữ liệu");
    expect(parseDelimitedWords(vocabularyRowsText(selected))).toMatchObject([
      { word: "storage", meaning: "sự lưu trữ; bảo quản, kho | dữ liệu" },
    ]);
    expect(parseDelimitedWords(vocabularyRowsText(selected))).toHaveLength(1);
  });
  it("keeps embedded tabs and newlines within a single import record", () => {
    expect(parseDelimitedWords(vocabularyRowsText([{ word: "storage\tunit", meaning: "kho\nchứa\r\ndữ\tliệu" }]))).toMatchObject([
      { word: "storage unit", meaning: "kho chứa dữ liệu" },
    ]);
  });
});
