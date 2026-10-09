import { z } from "zod";
import { grammarAnswerKey } from "../grammar-learning";
import { parseSelectionVocabulary } from "../selection-dictionary";
import { validateGrammarMembership, type GrammarCatalog, type GrammarTopic } from "./grammar-snapshot";

const related = z.object({ text: z.string(), meaning: z.string() });
const entry = z.object({
  word: z.string(), lemma: z.string(), meaning: z.string(), partOfSpeech: z.string(),
  phonetic: z.string(), phoneticUs: z.string(), phoneticUk: z.string(),
  audioUrl: z.string(), audioUsUrl: z.string(), audioUkUrl: z.string(),
  example: z.string(), exampleTranslation: z.string(), source: z.string(),
  phrases: z.array(related), synonyms: z.array(related), antonyms: z.array(related),
  wordFamily: z.array(z.object({ word: z.string(), meaning: z.string(), partOfSpeech: z.string() })),
});
const metadata = { version: z.literal(1), snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/), syncedAt: z.string().datetime() };
export const grammarAnswerIndexSchema = z.object({
  ...metadata,
  topics: z.record(z.string(), z.record(z.string(), z.enum(["A", "B", "C", "D"]))),
});
export const grammarDictionaryIndexSchema = z.object({
  ...metadata,
  topics: z.record(z.string(), z.record(z.string(), z.array(entry))),
});
export type GrammarDictionaryProjection = z.infer<typeof grammarDictionaryIndexSchema>;

/** Build projections only from already verified, provider-authorized materials. */
export function buildGrammarIndexes(catalog: GrammarCatalog, topics: GrammarTopic[], snapshotSha256: string) {
  if (topics.length !== catalog.topics.length || new Set(topics.map(topic => topic.topicId)).size !== topics.length) {
    throw new Error("Grammar index membership mismatch.");
  }
  for (const topic of topics) validateGrammarMembership(catalog, topic);
  const meta = { version: 1, snapshotSha256, syncedAt: catalog.syncedAt };
  return {
    answers: grammarAnswerIndexSchema.parse({ ...meta, topics: Object.fromEntries(topics.map(topic => [topic.topicId, grammarAnswerKey(topic)])) }),
    dictionary: grammarDictionaryIndexSchema.parse({ ...meta, topics: Object.fromEntries(topics.map(topic => [topic.topicId,
      Object.fromEntries(topic.questions.map(question => [question.id, parseSelectionVocabulary(question.vocabulary)])),
    ])) }),
  };
}

export function validateGrammarAnswerIndex(catalog: GrammarCatalog, index: z.infer<typeof grammarAnswerIndexSchema>) {
  if (index.syncedAt !== catalog.syncedAt || Object.keys(index.topics).length !== catalog.topics.length ||
    catalog.topics.some(topic => Object.keys(index.topics[topic.id] ?? {}).length !== topic.questionCount)) {
    throw new Error("Grammar answer index membership mismatch.");
  }
}
