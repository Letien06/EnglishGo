import { beforeEach, describe, expect, it, vi } from "vitest";
import { grammarFixture } from "../../test/grammar-fixture";
import type { GrammarCatalog, GrammarTopic } from "../storage/grammar-snapshot";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), topic: vi.fn(), projection: vi.fn(), revision: 0 }));
vi.mock("./dautoeic-grammar", () => ({ getGrammarCatalog: mocks.catalog, getGrammarTopic: mocks.topic }));
vi.mock("./dautoeic-drive", () => ({ readGrammarProjection: mocks.projection, contentCacheKey: () => "test" }));
import { lookupGrammarDictionary } from "./grammar-dictionary";
import { parseSelectionVocabulary } from "../selection-dictionary";

function library(count = 7) {
  const fixture = grammarFixture();
  const catalog: GrammarCatalog = { ...fixture.catalog, syncedAt: `2026-10-08T00:00:${String(++mocks.revision).padStart(2, "0")}Z`, topics: Array.from({ length: count }, (_, index) => ({ ...fixture.catalog.topics[0], id: `topic-${index}`, slug: `topic-${index}`, subtopics: [{ ...fixture.catalog.topics[0].subtopics[0], id: `sub-${index}` }] })) };
  const topics: GrammarTopic[] = catalog.topics.map((metadata, index) => ({ ...fixture.topic, topicId: metadata.id, questions: [{ ...fixture.topic.questions[0], id: `q-${index}`, topicId: metadata.id, subtopicId: `sub-${index}`, vocabulary: JSON.stringify({ vocabulary: [{ word: index === count - 1 ? "online" : "bank", lemma: index === count - 1 ? "online" : "bank", meaning_vi: index === count - 1 ? "trực tuyến" : index === 0 ? "bờ sông" : "ngân hàng", ipa_us: "source IPA", example_en: "Source example." }] }) }] }));
  return { catalog, topics };
}
beforeEach(() => { mocks.catalog.mockReset(); mocks.topic.mockReset(); mocks.projection.mockReset(); });

describe("licensed grammar library dictionary", () => {
  it("finds words across topics from one projection with no topic body reads", async () => {
    const { catalog, topics } = library();
    mocks.catalog.mockResolvedValue(catalog);
    mocks.projection.mockResolvedValue({ version: 1, snapshotSha256: "a".repeat(64), syncedAt: catalog.syncedAt, topics: Object.fromEntries(topics.map(topic => [topic.topicId, Object.fromEntries(topic.questions.map(question => [question.id, parseSelectionVocabulary(question.vocabulary)]))])) });
    const found = await lookupGrammarDictionary("online", { topicId: "topic-0", questionId: "q-0" });
    expect(found).toMatchObject({ scope: "library", match: "exact", entry: { word: "online", meaning: "trực tuyến", source: "Từ vựng ngữ pháp" } });
    expect(mocks.topic).not.toHaveBeenCalled();
    expect(JSON.stringify(found)).not.toContain("Choose a noun.");
    await lookupGrammarDictionary("online");
    expect(mocks.topic).not.toHaveBeenCalled();
    expect(mocks.projection).toHaveBeenCalledTimes(1);
  });
  it("prioritizes contextual source meaning and cannot label a mismatched question as current context", async () => {
    const { catalog, topics } = library(3);
    mocks.catalog.mockResolvedValue(catalog);
    mocks.projection.mockResolvedValue({ version: 1, snapshotSha256: "a".repeat(64), syncedAt: catalog.syncedAt, topics: Object.fromEntries(topics.map(topic => [topic.topicId, Object.fromEntries(topic.questions.map(question => [question.id, parseSelectionVocabulary(question.vocabulary)]))])) });
    expect(await lookupGrammarDictionary("bank", { topicId: "topic-0", questionId: "q-0" })).toMatchObject({ scope: "question", entry: { meaning: "bờ sông" } });
    expect(await lookupGrammarDictionary("bank", { topicId: "topic-1", questionId: "q-0" })).toMatchObject({ scope: "topic", entry: { meaning: "ngân hàng" } });
    expect(await lookupGrammarDictionary("bank", { topicId: "missing-topic", questionId: "q-0" })).toMatchObject({ scope: "library" });
    expect(await lookupGrammarDictionary("unknownword")).toBeNull();
  });
  it("clears failed promises and invalidates the bounded index when synchronization changes", async () => {
    const { catalog, topics } = library(1);
    mocks.catalog.mockResolvedValue(catalog);
    mocks.projection.mockRejectedValueOnce(new Error("Broken material"));
    await expect(lookupGrammarDictionary("online")).rejects.toThrow("Broken material");
    mocks.projection.mockResolvedValue({ version: 1, snapshotSha256: "a".repeat(64), syncedAt: catalog.syncedAt, topics: Object.fromEntries(topics.map(topic => [topic.topicId, Object.fromEntries(topic.questions.map(question => [question.id, parseSelectionVocabulary(question.vocabulary)]))])) });
    await expect(lookupGrammarDictionary("online")).resolves.toMatchObject({ entry: { meaning: "trực tuyến" } });
    expect(mocks.projection).toHaveBeenCalledTimes(2);
    const changed = library(1);
    changed.topics[0].questions[0].vocabulary = '{"vocabulary":[{"word":"online","meaning_vi":"nguồn mới"}]}';
    mocks.catalog.mockResolvedValue(changed.catalog);
    mocks.projection.mockResolvedValue({ version: 1, snapshotSha256: "a".repeat(64), syncedAt: changed.catalog.syncedAt, topics: { "topic-0": { "q-0": parseSelectionVocabulary(changed.topics[0].questions[0].vocabulary) } } });
    expect(await lookupGrammarDictionary("online")).toMatchObject({ entry: { meaning: "nguồn mới" } });
    expect(mocks.projection).toHaveBeenCalledTimes(3);
  });
  it("does not attempt reads for invalid selections or invent entries from missing libraries", async () => {
    expect(await lookupGrammarDictionary("an entire invalid paragraph with too many selected words")).toBeNull();
    expect(mocks.catalog).not.toHaveBeenCalled();
    mocks.catalog.mockResolvedValue(null);
    expect(await lookupGrammarDictionary("online")).toBeNull();
    expect(mocks.projection).not.toHaveBeenCalled();
  });
});
