import { ApiError } from "../api/response";
import { grammarCatalogSchema, grammarTopicSchema, validateGrammarMembership, type GrammarCatalog, type GrammarTopic } from "../storage/grammar-snapshot";
import { isDriveContentEnabled, readDriveMaterial, readGrammarProjection } from "./dautoeic-drive";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";
import type { GrammarAnswerKey } from "../grammar-learning";
import { grammarAnswerIndexSchema, validateGrammarAnswerIndex } from "../storage/grammar-index";

export async function getGrammarCatalog(): Promise<GrammarCatalog | null> {
  if (!isDriveContentEnabled()) return null;
  try {
    const catalog = grammarCatalogSchema.parse(await readDriveMaterial(`${DAUTOEIC_SOURCE_VERSION}__grammar__catalog`));
    catalog.topics.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    return catalog;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getGrammarTopic(slugOrId: string): Promise<GrammarTopic | null> {
  const catalog = await getGrammarCatalog();
  const entry = catalog?.topics.find((topic) => topic.id === slugOrId.trim() || topic.slug === slugOrId.trim());
  if (!catalog || !entry) return null;
  return loadGrammarTopic(catalog, entry);
}

async function loadGrammarTopic(catalog: GrammarCatalog, entry: GrammarCatalog["topics"][number]): Promise<GrammarTopic> {
  const topic = grammarTopicSchema.parse(await readDriveMaterial(`${DAUTOEIC_SOURCE_VERSION}__grammar__topic__${entry.id}`));
  if (topic.topicId !== entry.id) throw new Error("Grammar material identity mismatch.");
  validateGrammarMembership(catalog, topic);
  const subtopics = [...entry.subtopics].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const rank = new Map(subtopics.map((subtopic, index) => [subtopic.id, index]));
  topic.questions.sort((a, b) => (rank.get(a.subtopicId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.subtopicId) ?? Number.MAX_SAFE_INTEGER) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  return topic;
}

/** Send only IDs and correct letters to the device-local progress library. */
export async function getGrammarAnswerKeys(catalog: GrammarCatalog): Promise<Record<string, GrammarAnswerKey>> {
  if (!isDriveContentEnabled()) throw new Error("Grammar answer key material is unavailable.");
  const index = grammarAnswerIndexSchema.parse(await readGrammarProjection("grammar-answers.json"));
  validateGrammarAnswerIndex(catalog, index);
  return index.topics;
}
