import { describe, expect, it } from "vitest";
import {
  WRITING_PART_ONE_GRAMMAR_CATEGORIES,
  type WritingPartOneGrammarCategory,
} from "@/types/writing";
import {
  SEED_WRITING_PROMPTS,
  evaluateWritingDeterministically,
} from "./writing";

describe("original Writing seed library", () => {
  it("covers all three TOEIC Writing practice parts with original content", () => {
    expect(SEED_WRITING_PROMPTS.filter((item) => item.part === 1)).toHaveLength(74);
    expect(SEED_WRITING_PROMPTS.filter((item) => item.part === 2)).toHaveLength(24);
    expect(SEED_WRITING_PROMPTS.filter((item) => item.part === 3)).toHaveLength(4);

    for (const prompt of SEED_WRITING_PROMPTS) {
      expect(prompt.status).toBe("PUBLISHED");
      expect(prompt.sourceLabel).toBe("Nội dung gốc EnglishGo");
      expect(prompt.rubric.length).toBeGreaterThan(0);
      expect(prompt.sampleAnswers.length).toBeGreaterThan(0);
    }
  });

  it("keeps the expanded Part 1 picture library balanced across grammar categories", () => {
    const partOne = SEED_WRITING_PROMPTS.filter((item) => item.part === 1);
    const categoryCounts = partOne.reduce<Record<WritingPartOneGrammarCategory, number>>(
      (counts, prompt) => {
        expect(prompt.part1Category).not.toBeNull();
        const category = prompt.part1Category!;
        counts[category] += 1;
        return counts;
      },
      { N_N: 0, V_N: 0, N_PREP: 0, V_PREP: 0 },
    );

    for (const category of WRITING_PART_ONE_GRAMMAR_CATEGORIES) {
      expect(categoryCounts[category]).toBeGreaterThanOrEqual(18);
    }

    const counts = Object.values(categoryCounts);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);

    expect(SEED_WRITING_PROMPTS.filter((item) => item.part !== 1)
      .every((prompt) => prompt.part1Category === null)).toBe(true);
  });

  it("gives every Part 2 email drill a complete brief, checklist, and four-point rubric", () => {
    const partTwo = SEED_WRITING_PROMPTS.filter((item) => item.part === 2);

    expect(partTwo).toHaveLength(24);

    for (const prompt of partTwo) {
      expect(prompt.part1Category).toBeNull();
      expect(prompt.email).not.toBeNull();
      expect(prompt.email).toMatchObject({
        fromName: expect.any(String),
        toName: expect.any(String),
        subject: expect.any(String),
        body: expect.any(String),
      });
      expect(prompt.taskChecklist.length).toBeGreaterThanOrEqual(3);
      expect(prompt.taskChecklist.every((item) => item.trim().length > 0)).toBe(true);
      expect(prompt.rubric.length).toBeGreaterThanOrEqual(3);
      expect(prompt.rubric.reduce((sum, item) => sum + item.maxScore, 0)).toBe(4);
      expect(prompt.rubric.every((item) => item.id && item.label && item.description)).toBe(true);
      expect(prompt.responseRules.minWords).toBeGreaterThanOrEqual(60);
      expect(prompt.responseRules.recommendedWords).toBeGreaterThanOrEqual(100);
      expect(prompt.responseRules.maxWords).toBeGreaterThanOrEqual(300);
    }
  });

  it("accepts an inflected required term and enforces one sentence for Part 1", () => {
    const prompt = SEED_WRITING_PROMPTS.find((item) => item.id === "p1-meeting-preparation");
    expect(prompt).toBeDefined();

    const valid = evaluateWritingDeterministically(
      prompt!,
      "The employee is preparing the meeting room for a presentation.",
    );
    expect(valid.requiredTerms).toEqual([
      { term: "prepare", found: true },
      { term: "presentation", found: true },
    ]);
    expect(valid.checks.find((item) => item.id === "sentences")?.passed).toBe(true);

    const twoSentences = evaluateWritingDeterministically(
      prompt!,
      "The employee is preparing the room. The presentation begins soon.",
    );
    expect(twoSentences.checks.find((item) => item.id === "sentences")?.passed).toBe(false);
  });

  it("sets task-specific time and scoring ranges", () => {
    const partOne = SEED_WRITING_PROMPTS.find((item) => item.part === 1)!;
    const partTwo = SEED_WRITING_PROMPTS.find((item) => item.part === 2)!;
    const partThree = SEED_WRITING_PROMPTS.find((item) => item.part === 3)!;

    expect(partOne.timeLimitMinutes).toBe(8);
    expect(partTwo.timeLimitMinutes).toBe(10);
    expect(partThree.timeLimitMinutes).toBe(30);
    expect(partOne.rubric.reduce((sum, item) => sum + item.maxScore, 0)).toBe(3);
    expect(partTwo.rubric.reduce((sum, item) => sum + item.maxScore, 0)).toBe(4);
    expect(partThree.rubric.reduce((sum, item) => sum + item.maxScore, 0)).toBe(5);
  });
});
