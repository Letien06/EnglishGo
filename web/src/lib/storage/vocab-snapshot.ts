import { z } from "zod";

const nullableText = z.string().nullable();
const nullableInteger = z.number().int().nullable();
const identifier = z.string().min(1);
const vocabSet = z.object({ id: identifier, name: nullableText, orderIndex: nullableInteger });
const vocabTest = z.object({
  testId: identifier, setId: identifier, name: nullableText,
  partCount: z.number().int().positive(), wordCount: z.number().int().positive(),
  orderIndex: nullableInteger, accessLevel: nullableText,
});
const vocabPart = z.object({ id: identifier, testId: identifier, name: nullableText, orderIndex: nullableInteger });
const vocabWord = z.object({
  id: identifier, partId: identifier, word: z.string().trim().min(1), ipa: nullableText,
  audioUrl: nullableText, audioUsUrl: nullableText, audioUkUrl: nullableText, imageUrl: nullableText,
  meanings: z.array(z.record(z.string(), z.unknown())), phrases: z.array(z.unknown()), synonyms: z.array(z.unknown()),
  orderIndex: nullableInteger, difficultyLevel: nullableInteger,
});

export const vocabularySnapshotSchema = z.object({
  accessScope: z.enum(["public", "provider-authorized"]).optional(),
  catalog: z.object({ sets: z.array(vocabSet), tests: z.array(vocabTest).min(1) }),
  parts: z.array(vocabPart).min(1), words: z.array(vocabWord).min(1),
}).superRefine((snapshot, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const sets = new Set(snapshot.catalog.sets.map((set) => set.id));
  const tests = new Map(snapshot.catalog.tests.map((test) => [test.testId, test]));
  const parts = new Map(snapshot.parts.map((part) => [part.id, part]));
  if (
    sets.size !== snapshot.catalog.sets.length ||
    tests.size !== snapshot.catalog.tests.length ||
    parts.size !== snapshot.parts.length ||
    new Set(snapshot.words.map((word) => word.id)).size !== snapshot.words.length
  ) {
    fail("Duplicate vocabulary IDs.");
  }

  // Linear O(T + P + W) aggregation instead of O(T * (P + W)) nested filters.
  const partCountByTest = new Map<string, number>();
  for (const part of snapshot.parts) {
    if (!tests.has(part.testId)) {
      fail("Unknown vocabulary test.");
      continue;
    }
    partCountByTest.set(part.testId, (partCountByTest.get(part.testId) ?? 0) + 1);
  }

  const wordCountByTest = new Map<string, number>();
  for (const word of snapshot.words) {
    const part = parts.get(word.partId);
    if (!part) {
      fail("Unknown vocabulary part.");
      continue;
    }
    wordCountByTest.set(part.testId, (wordCountByTest.get(part.testId) ?? 0) + 1);
  }

  for (const test of snapshot.catalog.tests) {
    if (
      !sets.has(test.setId) ||
      (test.accessLevel?.trim().toLowerCase() === "pro" && snapshot.accessScope !== "provider-authorized")
    ) {
      fail("Unavailable vocabulary test.");
    }
    if (
      (partCountByTest.get(test.testId) ?? 0) !== test.partCount ||
      (wordCountByTest.get(test.testId) ?? 0) !== test.wordCount
    ) {
      fail(`Vocabulary count mismatch: ${test.testId}`);
    }
  }
});

export type VocabularySnapshot = z.infer<typeof vocabularySnapshotSchema>;
