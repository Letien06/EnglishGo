import type { GrammarCatalog, GrammarTopic } from "../lib/storage/grammar-snapshot";
export function grammarFixture(): { catalog: GrammarCatalog; topic: GrammarTopic } {
  return {
    catalog: { version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", syncedAt: "2026-10-08T00:00:00.000Z", topics: [{ id: "1", slug: "nouns", title: "Danh từ", bigTopic: null, orderIndex: 1, questionCount: 1, subtopics: [{ id: "11", slug: "noun-types", title: "Các loại danh từ", orderIndex: 1, accessLevel: "pro", questionCount: 1 }] }] },
    topic: { version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", topicId: "1", questions: [{ id: "101", topicId: "1", subtopicId: "11", text: "Choose a noun.", options: { A: "office", B: "quickly", C: "fast", D: null }, answer: "A", explanation: "A noun.", translation: "Chọn danh từ.", vocabulary: [{ word: "office" }], orderIndex: 1 }] },
  };
}
