import type { GrammarTopic } from "./storage/grammar-snapshot";

export const GRAMMAR_GROUPS = ["Từ loại", "Động từ", "Ngữ pháp khác"] as const;
export type GrammarAnswers = Record<string, string>;
export type GrammarAnswerKey = Record<string, string>;

function normalizedGroup(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").trim().replace(/\s+/g, " ").toLowerCase();
}

export function grammarTopicGroup(bigTopic: string | null): typeof GRAMMAR_GROUPS[number] {
  const normalized = normalizedGroup(bigTopic ?? "");
  return GRAMMAR_GROUPS.find(group => normalizedGroup(group) === normalized) ?? "Ngữ pháp khác";
}

export function grammarStorageKey(learnerId: string, topicId: string): string {
  return `englishweb:grammar:v1:${learnerId}:${topicId}`;
}

export function grammarAnswerKey(topic: GrammarTopic): GrammarAnswerKey {
  return Object.fromEntries(topic.questions.map(question => [question.id, question.answer]));
}

export function readGrammarAnswers(raw: string | null, answerKey: GrammarAnswerKey): GrammarAnswers {
  try {
    const saved: unknown = JSON.parse(raw ?? "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([id, answer]) =>
      Object.prototype.hasOwnProperty.call(answerKey, id) && typeof answer === "string" && /^[A-D]$/.test(answer)));
  } catch { return {}; }
}

export function getGrammarProgress(answerKey: GrammarAnswerKey, answers: GrammarAnswers): { total: number; answered: number; correct: number; wrong: number } {
  const entries = Object.entries(answerKey);
  let answered = 0;
  let correct = 0;
  for (const [id, expected] of entries) {
    if (!Object.prototype.hasOwnProperty.call(answers, id) || !/^[A-D]$/.test(answers[id])) continue;
    answered += 1;
    if (answers[id] === expected) correct += 1;
  }
  return { total: entries.length, answered, correct, wrong: answered - correct };
}
