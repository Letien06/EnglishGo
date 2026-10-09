import { describe, expect, it } from "vitest";
import { grammarFixture } from "../../test/grammar-fixture";
import { buildGrammarIndexes, validateGrammarAnswerIndex } from "./grammar-index";

describe("grammar build projections", () => {
  it("preserves exact answers and dictionary meanings without shipping question/explanation bodies", () => {
    const { catalog, topic } = grammarFixture();
    topic.questions[0].vocabulary = [{ word: "carry", meaning_vi: "mang theo" }];
    const indexes = buildGrammarIndexes(catalog, [topic], "a".repeat(64));
    validateGrammarAnswerIndex(catalog, indexes.answers);
    expect(indexes.answers.topics[topic.topicId][topic.questions[0].id]).toBe(topic.questions[0].answer);
    expect(indexes.dictionary.topics[topic.topicId][topic.questions[0].id][0]).toMatchObject({ word: "carry", meaning: "mang theo" });
    expect(JSON.stringify(indexes)).not.toContain(topic.questions[0].text);
    expect(indexes.dictionary.topics[topic.topicId][topic.questions[0].id][0]).not.toHaveProperty("explanation");
  });

  it("rejects missing topics and mismatched snapshots/catalog revisions", () => {
    const { catalog, topic } = grammarFixture();
    expect(() => buildGrammarIndexes(catalog, [], "a".repeat(64))).toThrow(/membership/);
    expect(() => buildGrammarIndexes(catalog, [topic], "invalid")).toThrow();
    const { answers } = buildGrammarIndexes(catalog, [topic], "a".repeat(64));
    expect(() => validateGrammarAnswerIndex({ ...catalog, syncedAt: "2026-10-09T00:00:00.000Z" }, answers)).toThrow(/membership/);
  });
});
