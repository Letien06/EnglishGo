import type { DictationCatalog, DictationSet } from "../lib/storage/dictation-snapshot";

export function dictationFixture(): { catalog: DictationCatalog; set: DictationSet } {
  return {
    catalog: {
      version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", syncedAt: "2026-10-08T00:00:00.000Z",
      collections: [{ name: "TOEIC", orderIndex: 1 }], chapters: [{ collectionName: "TOEIC", name: "Chapter 1", orderIndex: 1 }],
      sets: [{ id: "set-1", name: "Lesson 1", part: 1, accessLevel: "pro", orderIndex: 1, collectionName: "TOEIC", chapterName: "Chapter 1", subtitle: null, itemCount: 1 }],
    },
    set: {
      version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", setId: "set-1",
      items: [{ id: "item-1", setId: "set-1", orderIndex: 1, audioUrl: "https://source.example/audio.mp3", transcript: "An English sentence.", translationVi: "Một câu tiếng Anh.", hint: null, vocabulary: null, durationSeconds: 4.5, groupId: null }],
    },
  };
}
