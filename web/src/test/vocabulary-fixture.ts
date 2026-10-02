import type { VocabularySnapshot } from "../lib/storage/vocab-snapshot";

export function vocabularyFixture(): VocabularySnapshot {
  return {
    catalog: {
      sets: [{ id: "group", name: "2026", orderIndex: 1 }],
      tests: [{ testId: "vocab-test", setId: "group", name: "Test 1", partCount: 2, wordCount: 2, orderIndex: 1, accessLevel: "free" }],
    },
    parts: [
      { id: "lc", testId: "vocab-test", name: "LC", orderIndex: 1 },
      { id: "rc", testId: "vocab-test", name: "RC", orderIndex: 2 },
    ],
    words: ["lc", "rc"].map((partId, index) => ({
      id: `word-${partId}`, partId, word: index ? "report" : "office", ipa: "/test/",
      audioUrl: "https://example.com/audio.mp3", audioUsUrl: null, audioUkUrl: null, imageUrl: null,
      meanings: [{ meaning: index ? "bao cao" : "van phong", pos: "n", example: "An example." }],
      phrases: [], synonyms: [], orderIndex: 1, difficultyLevel: null,
    })),
  };
}
