import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VocabularyArcade from "./VocabularyArcade";

vi.mock("../useVocabularyAudio", () => ({ default: () => ({ speakWord: vi.fn(), stop: vi.fn() }) }));
const words = [{ id: 1, word: "carry", meaning: "mang theo", mastered: false }];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("arcade interaction", () => {
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
