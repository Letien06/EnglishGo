import { getGrammarCatalog } from "./dautoeic-grammar";
import type { GrammarCatalog } from "../storage/grammar-snapshot";
import { contentCacheKey, readGrammarProjection } from "./dautoeic-drive";
import { grammarDictionaryIndexSchema } from "../storage/grammar-index";
import { isDictionarySelection, lookupSelectionDictionary, type SelectionDictionaryEntry, type SelectionDictionaryIndex, type SelectionDictionaryMatch } from "../selection-dictionary";

type Library = {
  all: SelectionDictionaryIndex;
  topics: Map<string, SelectionDictionaryEntry[]>;
  questions: Map<string, { topicId: string; entries: SelectionDictionaryEntry[] }>;
};
let cachedLibrary: { key: string; promise: Promise<Library> } | undefined;

async function buildLibrary(catalog: GrammarCatalog): Promise<Library> {
  const topics = new Map<string, SelectionDictionaryEntry[]>();
  const questions = new Map<string, { topicId: string; entries: SelectionDictionaryEntry[] }>();
  const projection = grammarDictionaryIndexSchema.parse(await readGrammarProjection("grammar-dictionary.json.gz"));
  if (projection.syncedAt !== catalog.syncedAt || Object.keys(projection.topics).length !== catalog.topics.length) throw new Error("Grammar dictionary index mismatch.");
  for (const topic of catalog.topics) {
    const projectedQuestions = projection.topics[topic.id];
    if (!projectedQuestions || Object.keys(projectedQuestions).length !== topic.questionCount) throw new Error("Grammar dictionary membership mismatch.");
    const entries: SelectionDictionaryEntry[] = [];
    for (const [id, vocabulary] of Object.entries(projectedQuestions)) {
      questions.set(id, { topicId: topic.id, entries: vocabulary });
      entries.push(...vocabulary);
    }
    topics.set(topic.id, entries);
  }
  return { topics, questions, all: { question: [], topic: [...topics.values()].flat() } };
}

function libraryFor(catalog: GrammarCatalog): Promise<Library> {
  const key = `${contentCacheKey()}:${catalog.syncedAt}`;
  if (cachedLibrary?.key !== key) {
    const promise = buildLibrary(catalog);
    cachedLibrary = { key, promise };
    void promise.catch(() => { if (cachedLibrary?.promise === promise) cachedLibrary = undefined; });
  }
  return cachedLibrary.promise;
}

export async function lookupGrammarDictionary(word: string, context: { topicId?: string; questionId?: string } = {}): Promise<SelectionDictionaryMatch | null> {
  if (!isDictionarySelection(word)) return null;
  const catalog = await getGrammarCatalog();
  if (!catalog) return null;
  const library = await libraryFor(catalog);
  const topicId = catalog.topics.find(topic => topic.id === context.topicId || topic.slug === context.topicId)?.id;
  const question = context.questionId ? library.questions.get(context.questionId) : undefined;
  const currentQuestion = question && (!context.topicId || question.topicId === topicId) ? question : undefined;
  const current = currentQuestion?.entries ?? [];
  const topic = library.topics.get(topicId ?? currentQuestion?.topicId ?? "") ?? [];
  const local = lookupSelectionDictionary(word, { question: current, topic });
  if (local) return local;
  const found = lookupSelectionDictionary(word, library.all);
  return found ? { ...found, scope: "library", entry: { ...found.entry, source: "Từ vựng ngữ pháp" } } : null;
}
