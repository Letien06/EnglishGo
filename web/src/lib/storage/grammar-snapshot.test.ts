import { describe, expect, it } from "vitest";
import { grammarFixture } from "../../test/grammar-fixture";
import { grammarCatalogSchema, grammarTopicSchema, validateGrammarMembership } from "./grammar-snapshot";

describe("authorized grammar validation", () => {
  it("retains numeric source IDs as strings, Pro and vocabulary metadata", () => {
    const { catalog, topic } = grammarFixture();
    expect(grammarCatalogSchema.parse(catalog)).toEqual(catalog);
    expect(grammarTopicSchema.parse(topic)).toEqual(topic);
    expect(() => validateGrammarMembership(catalog, topic)).not.toThrow();
  });
  it.each(["authorization", "duplicate", "membership", "answer", "empty-text"])("rejects invalid %s", (issue) => {
    const { topic } = grammarFixture();
    if (issue === "authorization") Reflect.deleteProperty(topic, "accessScope");
    if (issue === "duplicate") topic.questions.push(topic.questions[0]);
    if (issue === "membership") topic.questions[0].topicId = "2";
    if (issue === "answer") topic.questions[0].options.A = " ";
    if (issue === "empty-text") topic.questions[0].text = " ";
    expect(grammarTopicSchema.safeParse(topic).success).toBe(false);
  });
  it("checks subtopic counts and identity even when topic totals match", () => {
    const { catalog, topic } = grammarFixture();
    topic.questions[0].subtopicId = "other";
    expect(() => validateGrammarMembership(catalog, topic)).toThrow();
    catalog.topics[0].subtopics[0].questionCount = 2;
    expect(grammarCatalogSchema.safeParse(catalog).success).toBe(false);
  });
});
