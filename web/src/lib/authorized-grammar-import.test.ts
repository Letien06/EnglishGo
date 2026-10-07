import { describe, expect, it, vi } from "vitest";
import { fetchAuthorizedGrammarRows, grammarCheckpoint, readGrammarCheckpoint } from "../../scripts/lib/authorized-grammar-source.mjs";
import { mapAuthorizedGrammarRows, mergeAuthorizedGrammarSnapshot } from "../../scripts/lib/authorized-grammar-merge.mjs";
import { grammarCatalogSchema, grammarTopicSchema, validateGrammarMembership } from "./storage/grammar-snapshot";

const syncedAt = "2026-10-08T00:00:00.000Z";
function fixture() {
  return { topics: [{ id: 1, slug: "verbs", title_vi: "Động từ", big_topic: "Ngữ pháp", order_index: 1 }],
    subtopics: [{ id: 2, topic_id: 1, slug: "tense", title_vi: "Thì", order_index: 1, access_level: "pro", is_hidden: false }, { id: 3, topic_id: 1, slug: "empty", title_vi: "Chưa có câu", order_index: 2, access_level: "free" }],
    questions: [{ id: 20, topic_id: 1, subtopic_id: 2, question_text: "She ____ here.", option_a: "works", option_b: "work", correct_answer: "A", explanation_vi: "Chủ ngữ số ít.", translation_vi: "Cô ấy làm ở đây.", vocabulary: [{ word: "work", meaning: "làm việc" }], order_index: 2 }], catalog: [] };
}
describe("authorized grammar content import", () => {
  it("normalizes source identities, rich fields and playable topic counts", () => {
    const materials = mapAuthorizedGrammarRows(fixture(), syncedAt);
    const catalog = grammarCatalogSchema.parse(materials[0].payload);
    const topic = grammarTopicSchema.parse(materials[1].payload);
    validateGrammarMembership(catalog, topic);
    expect(catalog.topics[0].subtopics.map((row) => row.questionCount)).toEqual([1, 0]);
    expect(topic.questions[0]).toMatchObject({ id: "20", topicId: "1", subtopicId: "2", translation: "Cô ấy làm ở đây.", vocabulary: [{ word: "work", meaning: "làm việc" }] });
  });
  it("preserves unrelated content and archived questions while appending authorized questions", () => {
    const first = fixture(), materials = mapAuthorizedGrammarRows(first, syncedAt);
    const base = { materials: [{ key: "existing", kind: "vocabulary", payload: { words: [1] } }, ...materials] };
    const before = JSON.stringify(base);
    const next = fixture(); next.questions[0].id = 21;
    const merged = mergeAuthorizedGrammarSnapshot(base, next, syncedAt);
    expect(JSON.stringify(base)).toBe(before);
    expect(merged.materials[0]).toEqual(base.materials[0]);
    const catalog = grammarCatalogSchema.parse(merged.materials[1].payload), topic = grammarTopicSchema.parse(merged.materials[2].payload);
    expect(topic.questions.map((question) => question.id)).toEqual(["20", "21"]);
    validateGrammarMembership(catalog, topic);
  });
  it("validates source checkpoint integrity", () => {
    const checkpoint = grammarCheckpoint({ rows: fixture(), httpDate: syncedAt });
    expect(readGrammarCheckpoint(checkpoint).rows).toEqual(fixture());
    checkpoint.rows.questions[0].correct_answer = "B";
    expect(() => readGrammarCheckpoint(checkpoint)).toThrow();
  });
  it("removes provider learner counts from grammar catalog checkpoints", () => {
    const rows = { ...fixture(), catalog: [{ id: 1, slug: "verbs", title: "Động từ", big_topic: "Ngữ pháp", answered: 3, correct: 2, subtopics: [{ id: 2, slug: "tense", title: "Thì", total: 1, answered: 1, correct: 0 }] }] };
    const checkpoint = grammarCheckpoint({ rows, httpDate: syncedAt });
    expect(JSON.stringify(checkpoint)).not.toMatch(/answered|correct"/);
    expect(checkpoint.rows.catalog[0].subtopics[0].total).toBe(1);
  });
  it("fetches only authorized grammar membership, with counted question pagination and no progress requests", async () => {
    const rows = fixture();
    const request = vi.fn(async (path: string, options: { params?: Record<string, string> }) => {
      const data = path.endsWith("grammar_topics") ? rows.topics : path.endsWith("grammar_subtopics") ? rows.subtopics : path.endsWith("get_grammar_catalog") ? [] : rows.questions;
      if (path.endsWith("/questions")) expect(options.params?.topic_id).toBe("in.(1)");
      return { data, httpDate: syncedAt, headers: new Headers({ "content-range": `0-0/${data.length}` }) };
    });
    expect((await fetchAuthorizedGrammarRows({ request })).rows.questions).toHaveLength(1);
    expect(request.mock.calls.map(([path]) => path).some((path) => /attempt|progress|reset/.test(path))).toBe(false);
  });
});
