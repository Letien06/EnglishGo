import { describe, expect, it } from "vitest";
import { validateQuestionForPublish } from "./question-publish-validator";

describe("validateQuestionForPublish", () => {
  it("accepts a complete multiple-choice reading question", () => {
    const result = validateQuestionForPublish({
      content: "What is the purpose of the notice?",
      type: "MULTIPLE_CHOICE",
      part: 7,
      options: [
        { content: "To announce a meeting", correct: true },
        { content: "To sell a product", correct: false },
        { content: "To update an address", correct: false },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects multiple-choice questions without exactly one correct option", () => {
    const result = validateQuestionForPublish({
      content: "Choose the best answer.",
      type: "MULTIPLE_CHOICE",
      part: 5,
      options: [
        { content: "A", correct: true },
        { content: "B", correct: true },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Multiple-choice questions need exactly one correct option",
    );
  });

  it("requires listening questions to have media", () => {
    const result = validateQuestionForPublish({
      content: "What does the speaker imply?",
      type: "MULTIPLE_CHOICE",
      part: 3,
      options: [
        { content: "A", correct: true },
        { content: "B", correct: false },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Listening questions need audio or image media");
  });
});
