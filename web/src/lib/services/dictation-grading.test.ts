import { describe, expect, it } from "vitest";
import { buildPrompt, gradeDictationAttempt, normalizeDictationAnswer } from "./dictation-grading";

describe("dictation grading", () => {
  it("normalizes punctuation and curly apostrophes", () => {
    expect(normalizeDictationAnswer("  I'm, ready! ")).toBe("i'm ready");
  });

  it("builds a deterministic masked prompt", () => {
    const first = buildPrompt("s001", "We are meeting at noon tomorrow.", 50);
    expect(first).toEqual(buildPrompt("s001", "We are meeting at noon tomorrow.", 50));
    expect(first.prompt.some((token) => token.kind === "blank")).toBe(true);
    expect(first.prompt.find((token) => token.kind === "blank")).toMatchObject({ hint: expect.any(String) });
  });

  it("accepts a full dictation answer without punctuation", () => {
    const result = gradeDictationAttempt({ segmentId: "s001", expectedText: "I'm ready, thank you.", acceptedNormalizedAnswers: [], maskPercent: 100, blankAnswers: null, fullAnswer: "i'm ready thank you" });
    expect(result.scorePercent).toBe(100);
  });

  it("grades blank answers independently", () => {
    const prompt = buildPrompt("s001", "We are meeting at noon tomorrow.", 30);
    const answers = Object.fromEntries(prompt.prompt.filter((token) => token.kind === "blank").map((token) => [token.blankId, "wrong"]));
    const result = gradeDictationAttempt({ segmentId: "s001", expectedText: "We are meeting at noon tomorrow.", acceptedNormalizedAnswers: [], maskPercent: 30, blankAnswers: answers, fullAnswer: null });
    expect(result.scorePercent).toBe(0);
  });
});
