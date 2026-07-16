import { describe, expect, it } from "vitest";
import {
  SEED_WRITING_PROMPTS,
  evaluateWritingDeterministically,
} from "./writing";

describe("original Writing seed library", () => {
  it("covers all three TOEIC Writing practice parts with original content", () => {
    expect(SEED_WRITING_PROMPTS.filter((item) => item.part === 1)).toHaveLength(5);
    expect(SEED_WRITING_PROMPTS.filter((item) => item.part === 2)).toHaveLength(4);
    expect(SEED_WRITING_PROMPTS.filter((item) => item.part === 3)).toHaveLength(4);

    for (const prompt of SEED_WRITING_PROMPTS) {
      expect(prompt.status).toBe("PUBLISHED");
      expect(prompt.sourceLabel).toBe("Nội dung gốc EnglishGo");
      expect(prompt.rubric.length).toBeGreaterThan(0);
      expect(prompt.sampleAnswers.length).toBeGreaterThan(0);
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

