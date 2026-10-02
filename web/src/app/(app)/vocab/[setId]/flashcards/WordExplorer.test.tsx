import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WordExplorer from "./WordExplorer";

vi.mock("./useVocabularyAudio", () => ({ default: () => ({ speak: vi.fn(), speakWord: vi.fn(), stop: vi.fn() }) }));

describe("word explorer", () => {
  it("filters, flips and stars locally without changing mastery", () => {
    const words = [{ id: 1, word: "carry", meaning: "mang", mastered: false }, { id: 2, word: "bag", meaning: "túi", mastered: true }];
    render(<WordExplorer words={words} onLearn={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Lật thẻ xem đáp án" }));
    expect(screen.getByRole("button", { name: "Lật về mặt trước" })).toHaveTextContent("mang");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "túi" } });
    expect(screen.getByRole("button", { name: "Lật thẻ xem đáp án" })).toHaveTextContent("bag");
    fireEvent.click(screen.getByRole("button", { name: "☆ Gắn sao từ này" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Gắn sao (1)" }));
    expect(screen.getByRole("button", { name: "Lật thẻ xem đáp án" })).toHaveTextContent("bag");
    expect(words[0].mastered).toBe(false);
  });
});
