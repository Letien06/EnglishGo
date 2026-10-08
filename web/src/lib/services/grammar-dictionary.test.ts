import { beforeEach, describe, expect, it, vi } from "vitest";
import { grammarFixture } from "../../test/grammar-fixture";
import type { GrammarCatalog, GrammarTopic } from "../storage/grammar-snapshot";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), topic: vi.fn(), revision: 0 }));
vi.mock("./dautoeic-grammar", () => ({ getGrammarCatalog: mocks.catalog, getGrammarTopic: mocks.topic }));
import { lookupGrammarDictionary } from "./grammar-dictionary";

function library(count = 7) {
  const fixture = grammarFixture();
  const catalog: GrammarCatalog = { ...fixture.catalog, syncedAt: `2026-10-08T00:00:${String(++mocks.revision).padStart(2, "0")}Z`, topics: Array.from({ length: count }, (_, index) => ({ ...fixture.catalog.topics[0], id: `topic-${index}`, slug: `topic-${index}`, subtopics: [{ ...fixture.catalog.topics[0].subtopics[0], id: `sub-${index}` }] })) };
  const topics: GrammarTopic[] = catalog.topics.map((metadata, index) => ({ ...fixture.topic, topicId: metadata.id, questions: [{ ...fixture.topic.questions[0], id: `q-${index}`, topicId: metadata.id, subtopicId: `sub-${index}`, vocabulary: JSON.stringify({ vocabulary: [{ word: index === count - 1 ? "online" : "bank", lemma: index === count - 1 ? "online" : "bank", meaning_vi: index === count - 1 ? "trực tuyến" : index === 0 ? "bờ sông" : "ngân hàng", ipa_us: "source IPA", example_en: "Source example." }] }) }] }));
  return { catalog, topics };
}
beforeEach(() => { mocks.catalog.mockReset(); mocks.topic.mockReset(); });

describe("licensed grammar library dictionary", () => {
  it("finds online outside the current noun-like topic, labels library source and caps reads at three", async () => {
    const { catalog, topics } = library();
    let active = 0;
    let max = 0;
    mocks.catalog.mockResolvedValue(catalog);
    mocks.topic.mockImplementation(async id => {
      active++; max = Math.max(max, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active--; return topics.find(topic => topic.topicId === id);
    });
    const found = await lookupGrammarDictionary("online", { topicId: "topic-0", questionId: "q-0" });
    expect(found).toMatchObject({ scope: "library", match: "exact", entry: { word: "online", meaning: "trực tuyến", source: "Từ vựng ngữ pháp" } });
    expect(max).toBe(3);
    expect(mocks.topic).toHaveBeenCalledTimes(7);
    expect(JSON.stringify(found)).not.toContain("Choose a noun.");
    await lookupGrammarDictionary("online");
    expect(mocks.topic).toHaveBeenCalledTimes(7);
  });
  it("prioritizes contextual source meaning and cannot label a mismatched question as current context", async () => {
    const { catalog, topics } = library(3);
    mocks.catalog.mockResolvedValue(catalog);
    mocks.topic.mockImplementation(async id => topics.find(topic => topic.topicId === id));
    expect(await lookupGrammarDictionary("bank", { topicId: "topic-0", questionId: "q-0" })).toMatchObject({ scope: "question", entry: { meaning: "bờ sông" } });
    expect(await lookupGrammarDictionary("bank", { topicId: "topic-1", questionId: "q-0" })).toMatchObject({ scope: "topic", entry: { meaning: "ngân hàng" } });
    expect(await lookupGrammarDictionary("bank", { topicId: "missing-topic", questionId: "q-0" })).toMatchObject({ scope: "library" });
    expect(await lookupGrammarDictionary("unknownword")).toBeNull();
  });
  it("clears failed promises and invalidates the bounded index when synchronization changes", async () => {
    const { catalog, topics } = library(1);
    mocks.catalog.mockResolvedValue(catalog);
    mocks.topic.mockRejectedValueOnce(new Error("Broken material"));
    await expect(lookupGrammarDictionary("online")).rejects.toThrow("Broken material");
    mocks.topic.mockResolvedValue(topics[0]);
    await expect(lookupGrammarDictionary("online")).resolves.toMatchObject({ entry: { meaning: "trực tuyến" } });
    expect(mocks.topic).toHaveBeenCalledTimes(2);
    const changed = library(1);
    changed.topics[0].questions[0].vocabulary = '{"vocabulary":[{"word":"online","meaning_vi":"nguồn mới"}]}';
    mocks.catalog.mockResolvedValue(changed.catalog);
    mocks.topic.mockResolvedValue(changed.topics[0]);
    expect(await lookupGrammarDictionary("online")).toMatchObject({ entry: { meaning: "nguồn mới" } });
    expect(mocks.topic).toHaveBeenCalledTimes(3);
  });
  it("does not attempt reads for invalid selections or invent entries from missing libraries", async () => {
    expect(await lookupGrammarDictionary("an entire invalid paragraph with too many selected words")).toBeNull();
    expect(mocks.catalog).not.toHaveBeenCalled();
    mocks.catalog.mockResolvedValue(null);
    expect(await lookupGrammarDictionary("online")).toBeNull();
    expect(mocks.topic).not.toHaveBeenCalled();
  });
});
