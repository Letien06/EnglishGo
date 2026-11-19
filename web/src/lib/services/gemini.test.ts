import { describe, expect, it } from "vitest";
import { extractJson } from "./gemini";

describe("extractJson", () => {
  it("extracts a JSON object containing nested arrays (writing grading response)", () => {
    const raw = `Here is the evaluation:\n\`\`\`json\n{"summary":"Good sentence","criteria":[{"id":"languageControl","score":1}],"strengths":["Clear grammar"],"issues":[]}\n\`\`\``;
    const parsed = JSON.parse(extractJson(raw)) as {
      summary: string;
      criteria: Array<{ id: string; score: number }>;
      strengths: string[];
      issues: unknown[];
    };
    expect(parsed.summary).toBe("Good sentence");
    expect(parsed.criteria).toHaveLength(1);
    expect(parsed.strengths).toEqual(["Clear grammar"]);
    expect(parsed.issues).toEqual([]);
  });

  it("extracts a raw JSON object with multiple nested arrays without fences", () => {
    const raw = `{"summary":"Nice","criteria":[{"id":"a","score":2}],"strengths":["A","B"],"issues":["C"]}`;
    const parsed = JSON.parse(extractJson(raw));
    expect(parsed).toEqual({
      summary: "Nice",
      criteria: [{ id: "a", score: 2 }],
      strengths: ["A", "B"],
      issues: ["C"],
    });
  });

  it("extracts a top-level JSON array containing objects (vocab generation response)", () => {
    const raw = `Sure! [{"word":"agenda","meaning":"chương trình nghị sự"}] Hope that helps.`;
    const parsed = JSON.parse(extractJson(raw));
    expect(parsed).toEqual([{ word: "agenda", meaning: "chương trình nghị sự" }]);
  });
});
