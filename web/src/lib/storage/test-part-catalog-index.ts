import { z } from "zod";
import { DAUTOEIC_SOURCE_VERSION } from "../services/dautoeic-source";
import type { DauToeicPartTest, DauToeicPassage, DauToeicQuestion, DauToeicTest } from "../../types/dautoeic";

export interface TestPartCatalogEntry {
  test: DauToeicPartTest;
  items: Array<{ id: string; questionIds: string[] }>;
}

/** Same membership and ordering as the practice session, without lesson text. */
export function buildTestPartCatalogEntry(content: {
  test: DauToeicTest; part: number; questions: DauToeicQuestion[]; passages: DauToeicPassage[];
}): TestPartCatalogEntry {
  const { test, part } = content;
  const questions = [...new Map(content.questions
    .filter((question) => question.part === part && question.testId === test.id)
    .map((question) => [question.id, question])).values()]
    .sort((left, right) => (left.questionNumber ?? left.orderIndex ?? 0) - (right.questionNumber ?? right.orderIndex ?? 0));
  const passages = new Set(content.passages.filter((passage) => passage.part === part && passage.testId === test.id).map((passage) => passage.id));
  const grouped = new Map<string, string[]>();
  const standalone = [1, 2, 5].includes(part);
  for (const question of questions) {
    const id = !standalone && question.passageId ? question.passageId : question.id;
    if (!standalone && question.passageId && !passages.has(id)) throw new Error("Test part is missing a referenced passage.");
    const ids = grouped.get(id);
    if (ids) ids.push(question.id);
    else grouped.set(id, [question.id]);
  }
  return {
    test: {
      testId: test.id, testName: test.name ?? "Test", setName: test.setName ?? "Bộ đề TOEIC", part,
      questionCount: questions.length, itemCount: grouped.size, done: 0, correct: 0, wrong: 0, nextIndex: 0,
    },
    items: [...grouped].map(([id, questionIds]) => ({ id, questionIds })),
  };
}

const count = z.number().int().nonnegative();
const entry = z.object({
  test: z.object({
    testId: z.string().min(1), testName: z.string(), setName: z.string(), part: z.number().int().min(1).max(7),
    questionCount: count, itemCount: count, done: z.literal(0), correct: z.literal(0), wrong: z.literal(0), nextIndex: z.literal(0),
  }),
  items: z.array(z.object({ id: z.string().min(1), questionIds: z.array(z.string().min(1)).min(1) })),
}).refine((value) => value.items.length === value.test.itemCount && value.items.reduce((sum, item) => sum + item.questionIds.length, 0) === value.test.questionCount, "Invalid compact catalog counts.");

export const testPartCatalogIndexSchema = z.object({
  sourceVersion: z.literal(DAUTOEIC_SOURCE_VERSION),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  part: z.number().int().min(1).max(7),
  entries: z.record(z.string(), entry),
}).refine((value) => Object.entries(value.entries).every(([id, row]) => row.test.testId === id && row.test.part === value.part), "Invalid compact catalog membership.");
