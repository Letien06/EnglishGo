import { ApiError } from "../api/response";
import { grammarCatalogSchema, grammarTopicSchema, validateGrammarMembership, type GrammarCatalog, type GrammarTopic } from "../storage/grammar-snapshot";
import { isDriveContentEnabled, readDriveMaterial } from "./dautoeic-drive";
import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";

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
  const topic = grammarTopicSchema.parse(await readDriveMaterial(`${DAUTOEIC_SOURCE_VERSION}__grammar__topic__${entry.id}`));
  if (topic.topicId !== entry.id) throw new Error("Grammar material identity mismatch.");
  validateGrammarMembership(catalog, topic);
  const subtopics = [...entry.subtopics].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  topic.questions.sort((a, b) => subtopics.findIndex((subtopic) => subtopic.id === a.subtopicId) - subtopics.findIndex((subtopic) => subtopic.id === b.subtopicId) || (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  return topic;
}
