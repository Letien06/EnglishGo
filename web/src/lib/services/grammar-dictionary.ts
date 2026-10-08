import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";
import { getGrammarCatalog, getGrammarTopic } from "./dautoeic-grammar";
import { validateGrammarMembership, type GrammarCatalog } from "../storage/grammar-snapshot";
import { buildSelectionDictionaryIndex, isDictionarySelection, lookupSelectionDictionary, parseSelectionVocabulary, type SelectionDictionaryEntry, type SelectionDictionaryIndex, type SelectionDictionaryMatch } from "../selection-dictionary";

type Library = {
  all: SelectionDictionaryIndex;
  topics: Map<string, SelectionDictionaryEntry[]>;
  questions: Map<string, { topicId: string; entries: SelectionDictionaryEntry[] }>;
};
let cachedLibrary: { key: string; promise: Promise<Library> } | undefined;

async function buildLibrary(catalog: GrammarCatalog): Promise<Library> {
  const topics = new Map<string, SelectionDictionaryEntry[]>();
  const questions = new Map<string, { topicId: string; entries: SelectionDictionaryEntry[] }>();
  for (let offset = 0; offset < catalog.topics.length; offset += 3) {
    const loaded = await Promise.all(catalog.topics.slice(offset, offset + 3).map(async metadata => {
      const topic = await getGrammarTopic(metadata.id);
      if (!topic) throw new Error("Grammar dictionary material is unavailable.");
      validateGrammarMembership(catalog, topic);
      return topic;
    }));
    for (const topic of loaded) {
      const entries: SelectionDictionaryEntry[] = [];
      for (const question of topic.questions) {
        const vocabulary = parseSelectionVocabulary(question.vocabulary);
        questions.set(question.id, { topicId: topic.topicId, entries: vocabulary });
        entries.push(...vocabulary);
      }
      topics.set(topic.topicId, entries);
    }
  }
  return { topics, questions, all: buildSelectionDictionaryIndex(null, [...topics.values()]) };
}

function libraryFor(catalog: GrammarCatalog): Promise<Library> {
  const key = `${DAUTOEIC_SOURCE_VERSION}:${catalog.syncedAt}`;
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
