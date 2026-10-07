import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().min(1);
const orderIndex = z.number().int().nullable();
const provenance = { version: z.literal(1), source: z.literal("https://dauenglish.com"), accessScope: z.literal("provider-authorized") };
export const grammarCatalogSchema = z.strictObject({
  ...provenance, syncedAt: z.string().datetime(),
  topics: z.array(z.strictObject({
    id, slug: title, title, bigTopic: z.string().nullable(), orderIndex, questionCount: z.number().int().positive(),
    subtopics: z.array(z.strictObject({ id, slug: title, title, orderIndex, accessLevel: z.enum(["free", "pro"]), questionCount: z.number().int().nonnegative() })).min(1),
  })),
}).superRefine((catalog, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (new Set(catalog.topics.map((topic) => topic.id)).size !== catalog.topics.length || new Set(catalog.topics.map((topic) => topic.slug)).size !== catalog.topics.length) fail("Duplicate grammar topic.");
  const subtopicIds = new Set<string>();
  for (const topic of catalog.topics) {
    if (new Set(topic.subtopics.map((subtopic) => subtopic.slug)).size !== topic.subtopics.length) fail("Duplicate grammar subtopic slug.");
    if (topic.subtopics.reduce((count, subtopic) => count + subtopic.questionCount, 0) !== topic.questionCount) fail("Grammar catalog count mismatch.");
    for (const subtopic of topic.subtopics) {
      if (subtopicIds.has(subtopic.id)) fail("Duplicate grammar subtopic.");
      subtopicIds.add(subtopic.id);
    }
  }
});

export const grammarTopicSchema = z.strictObject({
  ...provenance, topicId: id, syncedAt: z.string().datetime().optional(),
  questions: z.array(z.strictObject({
    id, topicId: id, subtopicId: id, text: title,
    options: z.strictObject({ A: z.string().nullable(), B: z.string().nullable(), C: z.string().nullable(), D: z.string().nullable() }),
    answer: z.enum(["A", "B", "C", "D"]), explanation: z.string().nullable(), translation: z.string().nullable(),
    vocabulary: z.unknown(), orderIndex,
  })).min(1),
}).superRefine((topic, context) => {
  if (new Set(topic.questions.map((question) => question.id)).size !== topic.questions.length || topic.questions.some((question) => question.topicId !== topic.topicId || !question.options[question.answer]?.trim())) {
    context.addIssue({ code: "custom", message: "Invalid grammar question identity or correct option." });
  }
});

export type GrammarCatalog = z.infer<typeof grammarCatalogSchema>;
export type GrammarTopic = z.infer<typeof grammarTopicSchema>;

export function validateGrammarMembership(catalog: GrammarCatalog, topic: GrammarTopic) {
  const entry = catalog.topics.find((entry) => entry.id === topic.topicId);
  if (!entry || entry.questionCount !== topic.questions.length || topic.questions.some((question) => !entry.subtopics.some((subtopic) => subtopic.id === question.subtopicId))) throw new Error("Grammar topic membership or count mismatch.");
  for (const subtopic of entry.subtopics) if (topic.questions.filter((question) => question.subtopicId === subtopic.id).length !== subtopic.questionCount) throw new Error("Grammar subtopic count mismatch.");
}
