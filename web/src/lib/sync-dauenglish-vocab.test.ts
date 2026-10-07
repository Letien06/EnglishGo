import { describe, expect, it } from "vitest";
import { mergeVocabularySnapshots, parsePublicVocabularyCatalog, replaceVocabularyMaterial, vocabularySyncTimestamp } from "../../scripts/lib/vocabulary-merge.mjs";
import type { VocabularySnapshot } from "./storage/vocab-snapshot";

const sets = ["Crack Vol 1", "Crack Vol 2", "2026", "600 Essential Words", "2023", "2024", "TOEIC MASTER"].map((name, index) => ({ id: `set-${index}`, name, orderIndex: index + 1 }));
function snapshot(groups: Array<[number, number]>): VocabularySnapshot {
  const tests = groups.flatMap(([group, count]) => Array.from({ length: count }, (_, index) => ({
    testId: `test-${group}-${index}`, setId: sets[group].id, name: `Test ${index + 1}`, partCount: 1, wordCount: 1, orderIndex: index + 1, accessLevel: "free",
  })));
  return { catalog: { sets: structuredClone(sets), tests },
    parts: tests.map(test => ({ id: `${test.testId}-part`, testId: test.testId, name: "LC", orderIndex: 1 })),
    words: tests.map(test => ({ id: `${test.testId}-word`, partId: `${test.testId}-part`, word: test.testId, ipa: null, audioUrl: null, audioUsUrl: null, audioUkUrl: null, imageUrl: null, meanings: [{ meaning: "Nghĩa đã lưu" }], phrases: [], synonyms: [], orderIndex: 1, difficultyLevel: null })),
  };
}
function fixtures() {
  const archived = snapshot([[2, 30], [3, 33], [4, 7]]);
  const incoming = snapshot([[0, 10], [1, 7], [2, 7], [3, 33], [4, 7], [5, 7]]);
  const currentCatalog = snapshot([[0, 10], [1, 7], [2, 30], [3, 33], [4, 7], [5, 7], [6, 9]]).catalog;
  currentCatalog.tests.forEach(test => { if (test.setId === sets[6].id || (test.setId === sets[2].id && test.orderIndex! > 7)) test.accessLevel = "pro"; });
  return { archived, incoming, currentCatalog };
}

describe("incremental public vocabulary archive merge", () => {
  it("uses the source HTTP date when the host clock is seven hours behind", () => {
    const hostNow = Date.parse("2026-10-08T12:00:00Z");
    expect(vocabularySyncTimestamp("Thu, 08 Oct 2026 19:00:00 GMT", hostNow)).toBe("2026-10-08T19:00:00.000Z");
  });
  it.each([null, "", "not a date", "Thu, 08 Oct 999999999 19:00:00 GMT"])("falls back to the host clock for an unusable source date %s", date => {
    expect(vocabularySyncTimestamp(date, Date.parse("2026-10-08T12:00:00Z"))).toBe("2026-10-08T12:00:00.000Z");
  });
  it("preserves all 70 archived tests and adds 24 newly free tests with original IDs", () => {
    const { archived, incoming, currentCatalog } = fixtures();
    const before = structuredClone(archived);
    const { vocabulary, report } = mergeVocabularySnapshots(archived, incoming, currentCatalog);
    expect(report).toMatchObject({ retainedTests: 70, addedTests: 24, totalTests: 94, currentCatalogTests: 103 });
    expect(vocabulary.catalog.tests.slice(0, 70)).toEqual(archived.catalog.tests);
    expect(vocabulary.parts.slice(0, 70)).toEqual(archived.parts);
    expect(vocabulary.words.slice(0, 70)).toEqual(archived.words);
    expect(archived).toEqual(before);
    expect(vocabulary.catalog.sets).toEqual(sets);
    expect(report.groups.map(group => group.availableTests)).toEqual([10, 7, 30, 33, 7, 7, 0]);
    expect(report.groups.find(group => group.name === "TOEIC MASTER")).toMatchObject({ currentFreeTests: 0, currentProTests: 9, addedTests: 0, availableTests: 0 });
    expect(vocabulary.words.some(word => word.id.startsWith("test-6-"))).toBe(false);
    expect(vocabulary.catalog.tests.every(test => test.accessLevel === "free")).toBe(true);
  });
  it("keeps archived content when a still-free test's source content changes", () => {
    const { archived, incoming, currentCatalog } = fixtures();
    const changed = incoming.words.find(word => word.id === archived.words[0].id)!;
    changed.word = "changed upstream";
    const merged = mergeVocabularySnapshots(archived, incoming, currentCatalog).vocabulary;
    expect(merged.words.find(word => word.id === changed.id)).toEqual(archived.words[0]);
  });
  it("is idempotent when syncing the same public source again", () => {
    const { archived, incoming, currentCatalog } = fixtures();
    const first = mergeVocabularySnapshots(archived, incoming, currentCatalog).vocabulary;
    const second = mergeVocabularySnapshots(first, incoming, currentCatalog);
    expect(second.vocabulary).toEqual(first);
    expect(second.report).toMatchObject({ addedTests: 0, retainedTests: 94, totalTests: 94 });
  });
  it("rejects incoming PRO content, missing current free tests and count mismatches", () => {
    const { archived, incoming, currentCatalog } = fixtures();
    const pro = structuredClone(incoming); pro.catalog.tests[0].accessLevel = "pro";
    expect(() => mergeVocabularySnapshots(archived, pro, currentCatalog)).toThrow("Unavailable vocabulary test");
    const missing = snapshot([[0, 9], [1, 7], [2, 7], [3, 33], [4, 7], [5, 7]]);
    expect(() => mergeVocabularySnapshots(archived, missing, currentCatalog)).toThrow("Missing current public vocabulary test");
    const counts = structuredClone(currentCatalog); counts.tests[0].wordCount++;
    expect(() => mergeVocabularySnapshots(archived, incoming, counts)).toThrow("metadata mismatch");
  });
  it.each(["part", "word"])("rejects a new test reusing an archived %s ID", kind => {
    const archived = snapshot([[2, 1]]);
    const incoming = snapshot([[0, 1]]);
    if (kind === "part") { incoming.parts[0].id = archived.parts[0].id; incoming.words[0].partId = archived.parts[0].id; }
    else incoming.words[0].id = archived.words[0].id;
    expect(() => mergeVocabularySnapshots(archived, incoming)).toThrow("conflicts with archived IDs");
  });
  it("rejects moving a retained test to a different source group", () => {
    const { archived, incoming, currentCatalog } = fixtures();
    incoming.catalog.tests.find(test => test.testId === archived.catalog.tests[0].testId)!.setId = sets[0].id;
    currentCatalog.tests.find(test => test.testId === archived.catalog.tests[0].testId)!.setId = sets[0].id;
    expect(() => mergeVocabularySnapshots(archived, incoming, currentCatalog)).toThrow("group conflict");
  });
  it("preserves every unrelated material and refuses duplicate vocabulary entries", () => {
    const vocabulary = snapshot([[0, 1]]);
    const reading = { key: "dauenglish-v2__reading__all", kind: "reading", payload: { passages: ["unchanged"] }, syncedAt: "old" };
    const old = { key: "dauenglish-v2__vocabulary__all", kind: "vocabulary", payload: vocabulary, syncedAt: "old" };
    const merged = replaceVocabularyMaterial([reading, old], vocabulary, "new");
    expect(merged[0]).toBe(reading);
    expect(merged[1]).toMatchObject({ syncedAt: "new", payload: vocabulary });
    expect(() => replaceVocabularyMaterial([old, old], vocabulary, "new")).toThrow("duplicate vocabulary material");
  });
  it("parses current RPC metadata without treating PRO test metadata as content", () => {
    const parsed = parsePublicVocabularyCatalog({ sets: [{ id: "group", name: "TOEIC MASTER", order_index: 7 }], tests: JSON.stringify([{ test_id: "pro-test", set_id: "group", name: "Test", part_count: 2, word_count: 80, access_level: "pro" }]) });
    expect(parsed.tests[0]).toMatchObject({ testId: "pro-test", accessLevel: "pro", wordCount: 80 });
    expect(() => parsePublicVocabularyCatalog({ sets: [{ id: "same" }, { id: "same" }], tests: [] })).toThrow("Duplicate");
  });
});
