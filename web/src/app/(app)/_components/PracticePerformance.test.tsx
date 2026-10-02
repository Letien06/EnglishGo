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
  window.localStorage.clear();
  document.documentElement.dataset.theme = "light";
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(["listening", "reading"] as const)("%s responsive practice", (skill) => {
  it("switches themes without changing the selected answer or test", () => {
    const testSession = { ...session, testId: "theme-test", testName: "Test 1" };
    const common = { session: testSession, level: 1, mode: "normal", userLoggedIn: false, userUid: null, initialIndex: 0 };
    const { container } = render(skill === "listening" ? <ListenPracticeClient {...common} partId="part3" partNum={3} assist={30} /> : <ReadPracticeClient {...common} partId="part7" partNum={7} />);
    fireEvent.click(screen.getAllByLabelText("Đáp án B")[0]);
    expect(container.querySelector('[data-answer-state="wrong"]')).toHaveClass("bg-danger-soft", "text-danger-ink");
    expect(container.querySelector('[data-answer-state="correct"]')).toHaveClass("bg-success-soft", "text-success-ink");
    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang giao diện tối" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getAllByLabelText("Đáp án B")[0]).toBeChecked();
    expect(new URL(window.location.href).searchParams.get("testId")).toBe("theme-test");
    fireEvent.click(screen.getByRole("button", { name: "Chuyển sang giao diện sáng" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getAllByLabelText("Đáp án B")[0]).toBeChecked();
  });
  it("keeps the selected test in the header, mode URL and save request", () => {
    const testSession = { ...session, testId: "test-two", testName: "Test 2", setName: "Crack TOEIC Vol 1" };
    const common = { session: testSession, level: 1, mode: "normal", userLoggedIn: true, userUid: "learner", initialIndex: 0 };
    render(skill === "listening" ? <ListenPracticeClient {...common} partId="part3" partNum={3} assist={30} /> : <ReadPracticeClient {...common} partId="part7" partNum={7} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Part (3|7) · Test 2/);
    expect(screen.getByText("Crack TOEIC Vol 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Song ngữ" }));
    expect(new URL(window.location.href).searchParams.get("testId")).toBe("test-two");
    expect(new URL(window.location.href).searchParams.has("level")).toBe(false);
    fireEvent.click(screen.getAllByLabelText("Đáp án A")[0]);
    const call = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(call[1]!.body as string)).toMatchObject({ testId: "test-two", questionId: "q1", itemId: "one" });
  });
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

it("uses themed fill feedback and hidden word controls without submitting an answer", () => {
  const fillSession = { ...session, part: 1, items: [item("one", [{ ...question("fill"), optionA: "apple", optionB: "pear" }])] };
  render(<ListenPracticeClient session={fillSession} partId="part1" partNum={1} level={1} mode="fill" assist={30} userLoggedIn={false} userUid={null} initialIndex={0} />);
  const input = screen.getAllByRole("textbox", { name: "Điền từ còn thiếu" })[0];
  expect(input).toHaveAttribute("data-feedback", "idle");
  fireEvent.change(input, { target: { value: "wrong" } });
  expect(input).toHaveAttribute("data-feedback", "wrong");
  fireEvent.change(input, { target: { value: "apple" } });
  expect(input).toHaveAttribute("data-feedback", "correct");
  fireEvent.click(screen.getByRole("button", { name: "Lật từ" }));
  const hidden = screen.getAllByRole("button", { name: "Lật từ", exact: true }).find((button) => button.classList.contains("practice-hidden-word"))!;
  expect(hidden).toHaveClass("bg-teal-soft", "text-teal-ink");
  fireEvent.click(hidden);
  expect(fetch).not.toHaveBeenCalled();
});

it("shows a Part 5 question only once when its transcript duplicates the prompt", () => {
  const prompt = "The team is remarkably -------.";
  const readingSession = { ...session, part: 5, items: [{ ...session.items[0], transcript: prompt, questions: [{ ...question("single"), questionText: prompt }] }] };
  render(<ReadPracticeClient session={readingSession} partId="part5" partNum={5} level={1} mode="normal" userLoggedIn={false} userUid={null} initialIndex={0} />);
  expect(screen.getAllByText(prompt)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Ghi chú" })).toBeInTheDocument();
});

it("renders exam passage headings, entities and literal email brackets as text, not HTML", () => {
  const transcript = "<h2>STAFF TRAINING SESSION</h2><p>Topic: Caf&eacute; &mdash; &pound;30</p><p>&lt;contact@example.test&gt;</p><p>&lt;img src=x onerror=alert(1)&gt;</p>";
  const readingSession = { ...session, part: 7, testId: "test-one", items: [{ ...session.items[0], transcript }] };
  const { container } = render(<ReadPracticeClient session={readingSession} partId="part7" partNum={7} level={1} mode="normal" userLoggedIn={false} userUid={null} initialIndex={0} />);
  const passage = container.querySelector("pre")!;
  expect(passage.textContent).toContain("STAFF TRAINING SESSION\nTopic: Caf\u00e9 \u2014 \u00a330");
  expect(passage.textContent).toContain("<contact@example.test>");
  expect(passage.textContent).toContain("<img src=x onerror=alert(1)>");
  expect(passage.querySelector("img")).toBeNull();
});
