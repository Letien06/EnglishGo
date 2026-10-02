import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VocabularyArcade from "./VocabularyArcade";

vi.mock("../useVocabularyAudio", () => ({ default: () => ({ speakWord: vi.fn(), stop: vi.fn() }) }));
const words = [{ id: 1, word: "carry", meaning: "mang theo", mastered: false }];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("arcade interaction", () => {
  it("shows simultaneous rain drops, matches typed prefixes, and auto-catches a complete answer", () => {
    vi.useFakeTimers();
    const pool = [...words, { id: 2, word: "office", meaning: "văn phòng", mastered: false }, { id: 3, word: "invoice", meaning: "hóa đơn", mastered: false }];
    render(<VocabularyArcade words={pool} mode="rain" muted onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getAllByTestId("rain-drop")).toHaveLength(2);
    const clue = screen.getAllByTestId("rain-drop")[1];
    const answer = pool.find((word) => clue.textContent?.includes(word.meaning))!.word;
    fireEvent.change(screen.getByRole("textbox"), { target: { value: answer.slice(0, 2) } });
    expect(clue).toHaveAttribute("data-matching", "true");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: answer } });
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Chính xác");
    expect(screen.getAllByTestId("rain-drop")).toHaveLength(1);
  });
  it("suspends rain for leave confirmation and automatically pauses a hidden page", () => {
    vi.useFakeTimers();
    const props = { words, mode: "rain" as const, muted: true, onComplete: vi.fn(), onExit: vi.fn() };
    const view = render(<VocabularyArcade {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    view.rerender(<VocabularyArcade {...props} suspended />);
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByLabelText("Còn 3 mạng")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
    view.rerender(<VocabularyArcade {...props} />);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    hidden.mockReturnValue(false);
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByRole("heading", { name: "Đã tạm dừng" })).toBeInTheDocument();
    expect(screen.getByLabelText("Còn 3 mạng")).toBeInTheDocument();
    hidden.mockRestore();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("waits for an explicit start, pauses time, and finishes without network calls", () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const onComplete = vi.fn();
    render(<VocabularyArcade words={words} mode="rain" muted onComplete={onComplete} onExit={vi.fn()} />);
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByRole("button", { name: "Bắt đầu chơi" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng" }));
    act(() => vi.advanceTimersByTime(30000));
    expect(screen.getByLabelText("Còn 3 mạng")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Tiếp tục chơi" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Từ tiếng Anh" }), { target: { value: " CARRY " } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi" }));
    expect(screen.getByRole("status")).toHaveTextContent("Chính xác");
    fireEvent.click(screen.getByRole("button", { name: "Xem kết quả" }));
    expect(onComplete).toHaveBeenCalledWith({ score: 15, answers: [expect.objectContaining({ correct: true, item: words[0] })] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("cleans up timers when leaving the round", () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const view = render(<VocabularyArcade words={words} mode="blast" muted onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(onComplete).not.toHaveBeenCalled();
  });
  it("disables play for empty data instead of starting a broken round", () => {
    render(<VocabularyArcade words={[]} mode="blast" muted onComplete={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Bắt đầu chơi" })).toBeDisabled();
  });
});
