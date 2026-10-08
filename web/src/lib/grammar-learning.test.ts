import { describe, expect, it } from "vitest";
import { grammarFixture } from "../test/grammar-fixture";
import { GRAMMAR_GROUPS, grammarTopicGroup, grammarStorageKey, grammarAnswerKey, readGrammarAnswers, getGrammarProgress } from "./grammar-learning";

describe("device-local grammar progress", () => {
  it("retains legacy answer maps and isolates learner and topic storage keys", () => {
    const key = grammarAnswerKey(grammarFixture().topic);
    expect(grammarStorageKey("alice", "1")).toBe("englishweb:grammar:v1:alice:1");
    expect(grammarStorageKey("alice", "1")).not.toBe(grammarStorageKey("bob", "1"));
    expect(grammarStorageKey("alice", "1")).not.toBe(grammarStorageKey("alice", "2"));
    expect(readGrammarAnswers('{"101":"B","unknown":"A"}', key)).toEqual({ "101": "B" });
  });
  it("rejects corrupt storage, invalid letters, arrays and unknown question IDs", () => {
    const key = { q1: "A", q2: "B", q3: "C", q4: "D" };
    for (const raw of [null, "bad json", "null", "[]", '"text"']) expect(readGrammarAnswers(raw, key)).toEqual({});
    expect(readGrammarAnswers('{"q1":"a","q2":2,"q3":"CC","q4":"D","unknown":"A","constructor":"A"}', key)).toEqual({ q4: "D" });
  });
  it("counts correct and wrong answers against actual topic keys without counting unknown IDs", () => {
    expect(getGrammarProgress({ q1: "A", q2: "B", q3: "D" }, { q1: "A", q2: "C", q3: "", old: "D" })).toEqual({ total: 3, answered: 2, correct: 1, wrong: 1 });
    expect(getGrammarProgress({}, {})).toEqual({ total: 0, answered: 0, correct: 0, wrong: 0 });
  });
  it("returns answer letters only without source texts or explanations", () => {
    const topic = grammarFixture().topic;
    expect(grammarAnswerKey(topic)).toEqual(Object.fromEntries(topic.questions.map(question => [question.id, question.answer])));
    expect(Object.values(grammarAnswerKey(topic)).every(value => /^[A-D]$/.test(value))).toBe(true);
  });
  it("normalizes canonical groups and retains actual imported group totals", () => {
    expect(GRAMMAR_GROUPS).toEqual(["Từ loại", "Động từ", "Ngữ pháp khác"]);
    expect(grammarTopicGroup("  TU   LOAI ")).toBe("Từ loại");
    expect(grammarTopicGroup("ĐỘNG TỪ")).toBe("Động từ");
    expect(grammarTopicGroup(null)).toBe("Ngữ pháp khác");
    expect(grammarTopicGroup("Other")).toBe("Ngữ pháp khác");
    const topics = [
      ...[287, 130, 137].map(questionCount => ({ bigTopic: "Từ loại", questionCount })),
      ...[113, 129, 113, 76, 14, 137].map(questionCount => ({ bigTopic: "Động từ", questionCount })),
      ...[145, 164, 151, 156, 37, 54].map(questionCount => ({ bigTopic: "Ngữ pháp khác", questionCount })),
    ];
    expect(GRAMMAR_GROUPS.map(group => topics.filter(topic => grammarTopicGroup(topic.bigTopic) === group).reduce((sum, topic) => sum + topic.questionCount, 0))).toEqual([554, 582, 707]);
  });
});
