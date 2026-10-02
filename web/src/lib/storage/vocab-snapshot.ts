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
  catalog: z.object({ sets: z.array(vocabSet), tests: z.array(vocabTest).min(1) }),
  parts: z.array(vocabPart).min(1), words: z.array(vocabWord).min(1),
}).superRefine((snapshot, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const sets = new Set(snapshot.catalog.sets.map((set) => set.id));
  const tests = new Map(snapshot.catalog.tests.map((test) => [test.testId, test]));
  const parts = new Map(snapshot.parts.map((part) => [part.id, part]));
  if (sets.size !== snapshot.catalog.sets.length || tests.size !== snapshot.catalog.tests.length ||
      parts.size !== snapshot.parts.length || new Set(snapshot.words.map((word) => word.id)).size !== snapshot.words.length) fail("Duplicate vocabulary IDs.");
  for (const part of snapshot.parts) if (!tests.has(part.testId)) fail("Unknown vocabulary test.");
  for (const word of snapshot.words) if (!parts.has(word.partId)) fail("Unknown vocabulary part.");
  for (const test of snapshot.catalog.tests) {
    if (!sets.has(test.setId) || test.accessLevel?.trim().toLowerCase() === "pro") fail("Unavailable vocabulary test.");
    const testParts = new Set(snapshot.parts.filter((part) => part.testId === test.testId).map((part) => part.id));
    if (testParts.size !== test.partCount || snapshot.words.filter((word) => testParts.has(word.partId)).length !== test.wordCount) fail(`Vocabulary count mismatch: ${test.testId}`);
  }
});

export type VocabularySnapshot = z.infer<typeof vocabularySnapshotSchema>;
