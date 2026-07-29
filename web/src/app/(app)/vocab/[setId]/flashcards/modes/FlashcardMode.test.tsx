import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FlashcardMode from "./FlashcardMode";

const word = {
  id: 1,
  word: "frequently",
  meaning: "thường xuyên",
  partOfSpeech: "ADV",
  example: "Customers frequently inquire about warranty coverage.",
  mastered: false,
};

function renderFlashcard(flipped = false) {
  const callbacks = {
    onFlip: vi.fn(),
    onSpeakWord: vi.fn(),
    onSpeakWordUk: vi.fn(),
    onSpeakExample: vi.fn(),
  };
  const view = render(
    <FlashcardMode
      word={word}
      reverse={false}
      flipped={flipped}
      {...callbacks}
    />,
  );

  return { ...view, ...callbacks };
}

describe("FlashcardMode audio controls", () => {
  it("renders the audio controls below, outside the flippable card", () => {
    const { container } = renderFlashcard();
    const scene = container.querySelector(".flashcard-scene");

    expect(scene).not.toBeNull();
    expect(scene).not.toContainElement(screen.getByRole("button", { name: "US" }));
    expect(scene).not.toContainElement(screen.getByRole("button", { name: "UK" }));
    expect(scene).not.toContainElement(screen.getByRole("button", { name: "Nghe ví dụ" }));
  });

  it("plays US and UK audio without flipping the card", () => {
    const { onFlip, onSpeakWord, onSpeakWordUk } = renderFlashcard();

    fireEvent.click(screen.getByRole("button", { name: "US" }));
    fireEvent.click(screen.getByRole("button", { name: "UK" }));

    expect(onSpeakWord).toHaveBeenCalledTimes(1);
    expect(onSpeakWordUk).toHaveBeenCalledTimes(1);
    expect(onFlip).not.toHaveBeenCalled();
  });

  it("plays the example without flipping the card", () => {
    const { onFlip, onSpeakExample } = renderFlashcard();

    fireEvent.click(screen.getByRole("button", { name: "Nghe ví dụ" }));

    expect(onSpeakExample).toHaveBeenCalledTimes(1);
    expect(onFlip).not.toHaveBeenCalled();
  });

  it("still flips when the learner clicks elsewhere on the card", () => {
    const { onFlip } = renderFlashcard();

    fireEvent.click(screen.getByText("frequently"));

    expect(onFlip).toHaveBeenCalledTimes(1);
  });
});
