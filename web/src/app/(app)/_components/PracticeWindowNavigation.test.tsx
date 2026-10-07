import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicPracticeItem, DauToeicQuestion } from "@/types/dautoeic";
import type { PracticeWindowSession } from "@/lib/practice-window";

const mocks = vi.hoisted(() => ({ push: vi.fn(), resumeIndex: null as number | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/client-learning-progress-cache", () => ({ invalidateLearningLevels: vi.fn(), setActiveLearnerId: vi.fn() }));
vi.mock("@/lib/use-practice-resume", () => ({ usePracticeResume: ({ setIndex }: { setIndex: React.Dispatch<React.SetStateAction<number>> }) => {
  React.useEffect(() => { if (mocks.resumeIndex != null) setIndex(mocks.resumeIndex); }, [setIndex]);
  return { markInteraction: vi.fn(), resumeStatus: "" };
} }));
import ListenPracticeClient from "../listen/practice/ListenPracticeClient";
import ReadPracticeClient from "../read/practice/ReadPracticeClient";

function windowSession(offset: number, total = 60): PracticeWindowSession {
  return { part: 7, level: 3, title: "Practice", windowOffset: offset, total, items: Array.from({ length: Math.min(25, total - offset) }, (_, index) => ({
    id: `item-${offset + index}`, part: 7, level: 3, transcript: "Passage", questions: [{ id: `question-${offset + index}`, questionText: `Question ${offset + index}`, optionA: "Correct choice", optionB: "Wrong choice", correctAnswer: "A" } as DauToeicQuestion],
  } as DauToeicPracticeItem)) };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.resumeIndex = null;
  vi.stubGlobal("React", React); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each(["listening", "reading"] as const)("%s global practice navigation", skill => {
  function mount(offset: number, initialIndex: number, total = 60, initialAuto = false) {
    const session = windowSession(offset, total);
    window.history.replaceState(null, "", `/${skill === "reading" ? "read" : "listen"}/practice?part=${skill === "reading" ? "part7" : "part3"}&level=3&q=${offset + initialIndex}`);
    const common = { session, initialIndex, initialAuto, level: 3, mode: "bilingual", userLoggedIn: false, userUid: null };
    return render(skill === "reading" ? <ReadPracticeClient {...common} partId="part7" partNum={7} /> : <ListenPracticeClient {...common} partId="part3" partNum={3} assist={50} />);
  }
  it("moves from the 25th item to the next window while preserving mode and assist", () => {
    mount(0, 24);
    expect(screen.getByText("#25/60")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bài tiếp" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Bài tiếp" }));
    const url = new URL(mocks.push.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("q")).toBe("25");
    expect(url.searchParams.get("mode")).toBe("bilingual");
    if (skill === "listening") expect(url.searchParams.get("assist")).toBe("50");
  });
  it("moves back to absolute item 24 from the first item of the second window", () => {
    mount(25, 0);
    expect(screen.getByText("#26/60")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bài trước" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Bài trước" }));
    expect(new URL(mocks.push.mock.calls[0][0], "http://localhost").searchParams.get("q")).toBe("24");
  });
  it("keeps local resumed progress as an absolute URL position and counter", () => {
    mocks.resumeIndex = 3;
    mount(25, 0);
    expect(screen.getByText("#29/60")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("28");
    fireEvent.click(screen.getByRole("button", { name: "Bài tiếp" }));
    expect(screen.getByText("#30/60")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("29");
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("disables navigation only at the global first and last items", () => {
    const first = mount(0, 0);
    expect(screen.getByRole("button", { name: "Bài trước" })).toBeDisabled();
    first.unmount();
    mount(50, 9);
    expect(screen.getByRole("button", { name: "Bài tiếp" })).toBeDisabled();
    expect(screen.getByText("#60/60")).toBeInTheDocument();
  });
  it("auto-advances across the window boundary after answering the passage", async () => {
    mount(0, 24);
    fireEvent.click(screen.getByRole("button", { name: "Tự chuyển" }));
    fireEvent.click(screen.getByLabelText("Đáp án A"));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(new URL(mocks.push.mock.calls[0][0], "http://localhost").searchParams.get("q")).toBe("25");
    expect(new URL(mocks.push.mock.calls[0][0], "http://localhost").searchParams.get("auto")).toBe("1");
  });
  it("restores automatic advancement on the next window", async () => {
    mount(25, 0, 60, true);
    expect(screen.getByRole("button", { name: "Tự chuyển" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("Đáp án A"));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByText("#27/60")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("26");
  });
});
