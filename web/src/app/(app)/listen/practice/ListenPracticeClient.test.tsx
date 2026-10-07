import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DauToeicDifficultySession, DauToeicQuestion } from "@/types/dautoeic";
import ListenPracticeClient from "./ListenPracticeClient";

vi.mock("@/lib/use-practice-resume", () => ({ usePracticeResume: () => ({ markInteraction: () => {}, resumeStatus: "" }) }));
vi.mock("../../_components/PracticeHeader", () => ({ default: () => null }));
vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
const question: DauToeicQuestion = { id: "question", testId: null, passageId: null, part: 1, section: null, questionNumber: 1, audioUrl: null, imageUrl: null, passageText: null, questionText: "Listen", optionA: "A person is walking", optionB: "A person is sitting", optionC: null, optionD: null, correctAnswer: "A", explanationVi: null, explanationEn: null, difficultyLevel: null, orderIndex: null, translationVi: null, vocabulary: null, answerTranslationVi: null };
const session: DauToeicDifficultySession = { part: 1, level: 1, title: "Listen", total: 1, items: [{ id: "item", itemType: null, part: 1, level: 1, errorRate: null, totalAttempts: null, wrongCount: null, audioUrl: "/audio.mp3", imageUrl: null, transcript: null, translation: null, vocabulary: null, questions: [question] }] };
beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(mode = "normal") {
  const view = render(<ListenPracticeClient session={session} partId="part1" partNum={1} level={1} mode={mode} assist={0} userLoggedIn={false} initialIndex={0} userUid={null} />);
  const audio = view.container.querySelector("audio")!;
  const play = vi.spyOn(audio, "play").mockResolvedValue();
  const pause = vi.spyOn(audio, "pause").mockImplementation(() => {});
  audio.currentTime = 10;
  return { audio, play, pause, container: view.container };
}
it("leaves browser control chords and backward tab traversal untouched", () => {
  const { audio, play, pause } = mount();
  for (const key of ["f", "l", "r", "c"]) expect(fireEvent.keyDown(document, { key, ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(document, { key: "Tab", shiftKey: true })).toBe(true);
  expect(play).not.toHaveBeenCalled(); expect(pause).not.toHaveBeenCalled(); expect(audio.currentTime).toBe(10);
});
it("retains standalone modifier shortcuts and ignores held-key repeats", () => {
  const { audio, play } = mount();
  fireEvent.keyDown(document, { key: "Control", ctrlKey: true });
  expect(play).not.toHaveBeenCalled();
  fireEvent.keyDown(document, { key: "Control", ctrlKey: true, repeat: true });
  fireEvent.keyUp(document, { key: "Control" });
  expect(play).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document, { key: "Shift", shiftKey: true });
  expect(audio.currentTime).toBe(10);
  fireEvent.keyDown(document, { key: "Shift", shiftKey: true, repeat: true });
  fireEvent.keyUp(document, { key: "Shift" });
  expect(audio.currentTime).toBe(7);
});

it.each(["normal", "fill", "flip"])("preserves real modifier chord sequences in %s mode", (mode) => {
  const { audio, play, pause, container } = mount(mode);
  const before = container.innerHTML;
  expect(fireEvent.keyDown(document, { key: "Control", ctrlKey: true })).toBe(true);
  expect(fireEvent.keyDown(document, { key: "f", ctrlKey: true })).toBe(true);
  expect(fireEvent.keyUp(document, { key: "f", ctrlKey: true })).toBe(true);
  expect(fireEvent.keyUp(document, { key: "Control" })).toBe(true);
  expect(fireEvent.keyDown(document, { key: "Shift", shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(document, { key: "Tab", shiftKey: true })).toBe(true);
  expect(fireEvent.keyUp(document, { key: "Tab", shiftKey: true })).toBe(true);
  expect(fireEvent.keyUp(document, { key: "Shift" })).toBe(true);
  expect(play).not.toHaveBeenCalled(); expect(pause).not.toHaveBeenCalled(); expect(audio.currentTime).toBe(10);
  expect(container.innerHTML).toBe(before);
});

it("cancels modifier candidates on blur and ignores shortcuts while typing", () => {
  const { audio, play } = mount("fill");
  fireEvent.keyDown(document, { key: "Control", ctrlKey: true });
  fireEvent.blur(window);
  fireEvent.keyUp(document, { key: "Control" });
  const input = document.createElement("input"); document.body.appendChild(input);
  try {
    fireEvent.keyDown(input, { key: "Control", ctrlKey: true }); fireEvent.keyUp(input, { key: "Control" });
    fireEvent.keyDown(input, { key: "Shift", shiftKey: true }); fireEvent.keyUp(input, { key: "Shift" });
    expect(play).not.toHaveBeenCalled(); expect(audio.currentTime).toBe(10);
  } finally { input.remove(); }
});

it.each(["fill", "flip"])("retains unmodified Tab reveal in %s mode", (mode) => {
  mount(mode);
  expect(fireEvent.keyDown(document, { key: "Tab" })).toBe(false);
});
