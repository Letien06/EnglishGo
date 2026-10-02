import { describe, expect, it } from "vitest";
import { normalizeVocabularyAnswer, vocabularyDetails, vocabularyStudySteps } from "./vocab-content";

describe("vocabulary context", () => {
  it("normalizes snapshot metadata and rejects malformed media and phrases", () => {
    expect(vocabularyDetails({ imageUrl: "javascript:alert(1)", phrases: [null, 8, { phrase: "carry a bag", meaning: "mang túi" }], synonyms: ["bring", {}] })).toMatchObject({ imageUrl: undefined, phrases: [{ text: "carry a bag", meaning: "mang túi" }], synonyms: ["bring"] });
  });
  it("builds only available steps and ends with active recall", () => {
    const word = { id: 1, word: "carry", meaning: "mang", mastered: false, phrases: [{ text: "carry a bag", meaning: "mang túi" }], example: "I carry a bag.", exampleTranslation: "Tôi mang túi." };
    expect(vocabularyStudySteps(word).map((step) => step.kind)).toEqual(["word", "phrase", "example", "typing"]);
    expect(vocabularyStudySteps({ id: 2, word: "bag", meaning: "túi", mastered: false }).map((step) => step.kind)).toEqual(["word", "typing"]);
    expect(vocabularyStudySteps(word)[2].back).toBe("Tôi mang túi.");
  });
  it("accepts case, whitespace and typographic apostrophes without accepting partial words", () => {
    expect(normalizeVocabularyAnswer("  Sign  UP FOR ")).toBe("sign up for");
    expect(normalizeVocabularyAnswer("one’s bag")).toBe("one's bag");
    expect(normalizeVocabularyAnswer("carry")).not.toBe(normalizeVocabularyAnswer("car"));
  });
});
