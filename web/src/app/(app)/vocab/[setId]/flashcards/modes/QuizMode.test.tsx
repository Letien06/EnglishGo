import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import QuizMode from "./QuizMode";
const props = { quizMode: "context" as const, options: ["art", "office"], selected: "", correctAnswer: "art", index: 0, total: 1, score: 0, timer: 20, onSpeakWord: vi.fn(), onSpeakWordUk: vi.fn(), onSpeakExample: vi.fn(), onAnswer: vi.fn() };
describe("context quiz prompts", () => {
  it("asks for the English word and masks a complete target", () => {
    render(<QuizMode {...props} word={{ id: 1, word: "art", meaning: "nghệ thuật", example: "I study art.", mastered: false }} />);
    expect(screen.getByText("Chọn từ tiếng Anh điền vào chỗ trống")).toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveTextContent("I study ____.");
  });
  it("falls back to the meaning when the target only occurs inside another word", () => {
    render(<QuizMode {...props} word={{ id: 1, word: "art", meaning: "nghệ thuật", example: "The department is open.", mastered: false }} />);
    expect(screen.getByRole("heading")).toHaveTextContent("nghệ thuật");
    expect(screen.getByText("Chưa có câu ví dụ phù hợp. Chọn từ theo nghĩa bên trên.")).toBeInTheDocument();
  });
});
