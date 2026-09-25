import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {} }));

import {
  fetchListeningDifficultyLevelsFromSource,
  fetchListeningDifficultySessionFromSource,
  fetchListTestsFromSource,
  fetchPartFromSource,
  fetchReadingDifficultyLevelsFromSource,
  fetchReadingDifficultySessionFromSource,
} from "./dautoeic";
import { getVocabularyCatalog, getWordsForPart, listVocabularyParts } from "./dautoeic-vocab";

describe.skipIf(process.env.DAUENGLISH_LIVE_SMOKE !== "1")("Dau English read-only live smoke", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])("loads usable Part %i content through the adapter", async (part) => {
    const levels = part <= 4
      ? await fetchListeningDifficultyLevelsFromSource(part)
      : await fetchReadingDifficultyLevelsFromSource(part);
    const level = levels.find((entry) => (entry.total ?? 0) > 0);
    expect(level).toBeDefined();
    const session = part <= 4
      ? await fetchListeningDifficultySessionFromSource(part, level!.level, 1)
      : await fetchReadingDifficultySessionFromSource(part, level!.level, 1);
    expect(session.items).toHaveLength(1);
    expect(session.items[0].questions.length).toBeGreaterThan(0);
    expect(session.items[0].questions[0].correctAnswer).toMatch(/^[ABCD]$/);
    if (part >= 5) {
      expect(session.items[0].questions[0].questionText).toBeTruthy();
      expect(session.items[0].questions[0].optionA).toBeTruthy();
    }
    if (part <= 4) {
      expect(session.items[0].audioUrl).toMatch(/^https:\/\//);
      const response = await fetch(session.items[0].audioUrl!, {
        method: "HEAD", signal: AbortSignal.timeout(15_000),
      });
      expect(response.ok).toBe(true);
      expect(response.headers.get("content-type")).toMatch(/^audio\//);
    }
    console.info(`Part ${part}: ${levels.reduce((sum, entry) => sum + (entry.total ?? 0), 0)} readable items; sample has ${session.items[0].questions.length} questions`);
  }, 60_000);

  it("loads the public mock-test catalog and Part 1 images", async () => {
    const tests = await fetchListTestsFromSource();
    expect(tests.length).toBeGreaterThan(0);
    const content = await fetchPartFromSource(tests[0].id, 1);
    expect(content.questions.length).toBeGreaterThan(0);
    const image = content.questions.find((question) => question.imageUrl)?.imageUrl;
    expect(image).toMatch(/^https:\/\//);
    const response = await fetch(image!, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toMatch(/^image\//);
    console.info(`Mock tests: ${tests.length}; Part 1 sample: ${content.questions.length} questions`);
  }, 60_000);

  it("loads vocabulary without writing to Firestore", async () => {
    const catalog = await getVocabularyCatalog();
    expect(catalog.tests.length).toBeGreaterThan(0);
    const parts = await listVocabularyParts(catalog.tests[0].testId);
    expect(parts.length).toBeGreaterThan(0);
    const words = await getWordsForPart(parts[0].id);
    expect(words.length).toBeGreaterThan(0);
    expect(words[0].word).toBeTruthy();
    console.info(`Vocabulary: ${catalog.tests.length} tests; sample: ${words.length} words`);
  }, 60_000);
});
