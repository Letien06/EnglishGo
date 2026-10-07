import { describe, expect, it } from "vitest";
import { matchesVocabAnswer, quizContextPrompt, uniqueQuizAnswers } from "./vocab-quiz";

describe("vocabulary answer grading", () => {
  it("requires full English answers, including phrases, while tolerating case and whitespace", () => {
    expect(matchesVocabAnswer("off", "office", "english")).toBe(false);
    expect(matchesVocabAnswer("port", "airport", "english")).toBe(false);
    expect(matchesVocabAnswer("take", "take off", "english")).toBe(false);
    expect(matchesVocabAnswer(" OFFICE ", "office", "english")).toBe(true);
    expect(matchesVocabAnswer("take   off", "take off", "english")).toBe(true);
  });
  it("accepts Vietnamese meaning alternatives without accepting partial syllables", () => {
    expect(matchesVocabAnswer("phan bo", "phân bổ; cung cấp", "meaning")).toBe(true);
    expect(matchesVocabAnswer("cung cấp", "phân bổ; cung cấp", "meaning")).toBe(true);
    expect(matchesVocabAnswer("điều chỉnh", "điều chỉnh", "meaning")).toBe(true);
    expect(matchesVocabAnswer("ngh", "nghề nghiệp", "meaning")).toBe(false);
  });
});

describe("honest quiz questions", () => {
  it("deduplicates visible answers and omits blank alternatives", () => {
    expect(uniqueQuizAnswers(["office", " Office ", "airport", "airport", "", " "])).toEqual(["office", "airport"]);
  });
  it("blanks full words and phrases without changing fragments of other words", () => {
    expect(quizContextPrompt("art", "Our department displays art.")).toBe("Our department displays ____.");
    expect(quizContextPrompt("take off", "The planes TAKE  OFF soon.")).toBe("The planes ____ soon.");
    expect(quizContextPrompt("apply", "She applied for the job.")).toBeNull();
    expect(quizContextPrompt("art", "Our department is here.")).toBeNull();
    expect(quizContextPrompt("office")).toBeNull();
  });
  it("escapes punctuation in target words and removes translated speech tails", () => {
    expect(quizContextPrompt("C++", "We use C++ every day.")).toBe("We use ____ every day.");
    expect(quizContextPrompt("office", "The office is open. (Văn phòng mở cửa.)")).toBe("The ____ is open.");
  });
});
