import { describe, expect, it } from "vitest";
import { isCorrect } from "./grading";

describe("isCorrect", () => {
  it("marks selected option correct when option is marked correct", () => {
    expect(
      isCorrect(
        { selectedOptionId: 10 },
        [
          { id: 10, correct: true },
          { id: 11, correct: false },
        ],
        [],
      ),
    ).toBe(true);
  });

  it("marks selected option incorrect when option is marked wrong", () => {
    expect(
      isCorrect({ selectedOptionId: 11 }, [{ id: 11, correct: false }], []),
    ).toBe(false);
  });

  it("matches text response case-insensitively by default", () => {
    expect(
      isCorrect(
        { textResponse: " Hall " },
        [],
        [{ answerText: "hall", caseSensitive: false }],
      ),
    ).toBe(true);
  });

  it("respects case-sensitive accepted answers", () => {
    expect(
      isCorrect(
        { textResponse: "ielts" },
        [],
        [{ answerText: "IELTS", caseSensitive: true }],
      ),
    ).toBe(false);
  });
});
