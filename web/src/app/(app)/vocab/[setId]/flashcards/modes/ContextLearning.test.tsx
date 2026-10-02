import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ContextLearning from "./ContextLearning";

vi.mock("../useVocabularyAudio", () => ({ default: () => ({ speak: vi.fn(), stop: vi.fn() }) }));

describe("context learning", () => {
  it("offers word, phrase, example and typing steps without extra requests", () => {
    const onComplete = vi.fn();
    render(<ContextLearning words={[{ id: 1, word: "carry", meaning: "mang", mastered: false, phrases: [{ text: "carry a bag", meaning: "mang túi" }], example: "I carry a bag.", exampleTranslation: "Tôi mang túi." }]} onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "2. Cụm" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("carry a bag");
    fireEvent.click(screen.getByRole("button", { name: "Lật thẻ học" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("mang túi");
    fireEvent.click(screen.getByRole("button", { name: "4. Gõ từ" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "car" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    expect(screen.getByRole("status")).toHaveTextContent("Chưa đúng");
    fireEvent.click(screen.getByRole("button", { name: "Gõ lại" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "carry" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    fireEvent.click(screen.getByRole("button", { name: "Từ tiếp theo →" }));
    expect(onComplete).toHaveBeenCalledWith({ score: 0, answers: [expect.objectContaining({ correct: false, expected: "carry" })] });
  });
  it("allows exiting without submitting progress", () => {
    const onComplete = vi.fn();
    const onExit = vi.fn();
    render(<ContextLearning words={[{ id: 1, word: "carry", meaning: "mang", mastered: false }]} onComplete={onComplete} onExit={onExit} />);
    fireEvent.click(screen.getByRole("button", { name: "Thoát phiên học" }));
    expect(onExit).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
