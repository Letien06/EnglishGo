import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicDifficultySession, DauToeicPracticeItem, DauToeicQuestion } from "@/types/dautoeic";
import ListenPracticeClient from "../listen/practice/ListenPracticeClient";
import ReadPracticeClient from "../read/practice/ReadPracticeClient";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/use-practice-resume", () => ({ usePracticeResume: () => ({ markInteraction: vi.fn(), resumeStatus: "" }) }));
vi.mock("@/lib/client-learning-progress-cache", () => ({ invalidateLearningLevels: vi.fn(), setActiveLearnerId: vi.fn() }));

const question = (id: string) => ({ id, questionText: `Question ${id}`, optionA: "Correct choice", optionB: "Wrong choice", correctAnswer: "A" }) as DauToeicQuestion;
const item = (id: string, questions: DauToeicQuestion[]) => ({ id, questions, part: 3, level: 1 }) as DauToeicPracticeItem;
const session: DauToeicDifficultySession = { part: 3, level: 1, total: 2, title: "Practice", items: [item("one", [question("q1"), question("q2")]), item("two", [question("q3")])] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(["listening", "reading"] as const)("%s responsive practice", (skill) => {
  it("waits for the full passage, then advances without waiting for a slow save", async () => {
    const common = { session, level: 1, mode: "normal", userLoggedIn: true, userUid: "learner", initialIndex: 0 };
    render(skill === "listening" ? <ListenPracticeClient {...common} partId="part3" partNum={3} assist={30} /> : <ReadPracticeClient {...common} partId="part7" partNum={7} />);
    fireEvent.click(screen.getByRole("button", { name: "Tự chuyển" }));
    fireEvent.click(screen.getAllByLabelText("Đáp án A")[0]);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(screen.getByText("#1/2")).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText("Đáp án A")[1]);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(screen.getByText("#2/2")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
