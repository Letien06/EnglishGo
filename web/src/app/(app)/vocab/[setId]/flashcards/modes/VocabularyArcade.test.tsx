import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VocabularyArcade from "./VocabularyArcade";

const vocabularyAudio = vi.hoisted(() => ({ speakWord: vi.fn(), stop: vi.fn() }));
vi.mock("../useVocabularyAudio", () => ({ default: () => vocabularyAudio }));
const words = [{ id: 1, word: "carry", meaning: "mang theo", mastered: false }];
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function mockSoundContext() {
  const oscillator = {
    type: "",
    connect: vi.fn(),
    frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const gain = {
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  };
  const context = {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    close: vi.fn().mockResolvedValue(undefined),
  };
  vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
  return { context, oscillator };
}

describe("arcade interaction", () => {
  it("plays a celebration chime without pronouncing a correct Word Blast answer", () => {
    vi.useFakeTimers();
    const { context, oscillator } = mockSoundContext();
    render(<VocabularyArcade words={words} mode="blast" muted={false} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    expect(screen.getByRole("button", { name: "Tắt âm thanh" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /carry/i }));
    act(() => vi.advanceTimersByTime(500));
    expect(oscillator.type).toBe("sine");
    expect(oscillator.frequency.setValueAtTime.mock.calls).toEqual([[523, 0], [659, 0.1], [784, 0.2]]);
    expect(oscillator.start).toHaveBeenCalledTimes(1);
    expect(oscillator.stop).toHaveBeenCalledWith(0.35);
    expect(vocabularyAudio.speakWord).not.toHaveBeenCalled();
    oscillator.onended?.();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
  it("keeps muted Word Blast hits silent and does not replay them when unmuted", () => {
    vi.useFakeTimers();
    const { context } = mockSoundContext();
    render(<VocabularyArcade words={words} mode="blast" muted onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    fireEvent.click(screen.getByRole("button", { name: /carry/i }));
    act(() => vi.advanceTimersByTime(500));
    expect(context.createOscillator).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bật âm thanh" }));
    act(() => vi.advanceTimersByTime(500));
    expect(context.createOscillator).not.toHaveBeenCalled();
    expect(vocabularyAudio.speakWord).not.toHaveBeenCalled();
  });
  it("preserves automatic pronunciation for Vocabulary Rain", () => {
    vi.useFakeTimers();
    mockSoundContext();
    render(<VocabularyArcade words={words} mode="rain" muted={false} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Từ tiếng Anh" }), { target: { value: "carry" } });
    act(() => vi.advanceTimersByTime(500));
    expect(vocabularyAudio.speakWord).toHaveBeenCalledExactlyOnceWith(words[0]);
  });
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
    // With 1 word, auto-submit catches the answer and the game ends immediately → game over screen shown
    expect(screen.getByRole("heading", { name: /rất tốt/i })).toBeInTheDocument();
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
  it("auto-advances to onComplete after answering the final question in Word Blast", () => {
    vi.useFakeTimers();
    mockSoundContext();
    const onComplete = vi.fn();
    render(<VocabularyArcade words={words} mode="blast" muted onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));
    // 1 word in pool, so answering it triggers the final question completion
    fireEvent.click(screen.getByRole("button", { name: /carry/i }));
    expect(screen.getByText(/Chính xác/)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    // Advance past the 1000ms feedback delay
    act(() => vi.advanceTimersByTime(1100));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      score: 10,
      answers: [expect.objectContaining({ correct: true, item: words[0] })],
    });
  });
  it("displays word limit options for large pools and allows switching", () => {
    const largePool = Array.from({ length: 80 }, (_, i) => ({
      id: i + 1,
      word: `word${i + 1}`,
      meaning: `meaning ${i + 1}`,
      mastered: false,
    }));
    render(<VocabularyArcade words={largePool} mode="blast" muted onComplete={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByText("Tất cả (80 từ)")).toBeInTheDocument();
    expect(screen.getByText("20 từ (Chơi nhanh)")).toBeInTheDocument();
    expect(screen.getByText("50 từ")).toBeInTheDocument();
    expect(screen.getByText(/80 từ mỗi lượt/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("20 từ (Chơi nhanh)"));
    expect(screen.getByText(/20 từ mỗi lượt/)).toBeInTheDocument();
  });
  it("hides Xem kết quả on Game Over and restarts fresh when clicking THỬ LẠI", () => {
    vi.useFakeTimers();
    mockSoundContext();
    const onComplete = vi.fn();
    const onExit = vi.fn();
    const pool = [
      { id: 1, word: "word1", meaning: "meaning1", mastered: false },
      { id: 2, word: "word2", meaning: "meaning2", mastered: false },
      { id: 3, word: "word3", meaning: "meaning3", mastered: false },
      { id: 4, word: "word4", meaning: "meaning4", mastered: false },
    ];
    render(<VocabularyArcade words={pool} mode="blast" muted onComplete={onComplete} onExit={onExit} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));

    // Current target is shown in the clue h3
    const clueMeaning = screen.getByRole("heading", { level: 3 }).textContent;
    const targetWord = pool.find((p) => p.meaning === clueMeaning)!.word;
    const wrongButtons = screen.getAllByRole("button").filter(
      (b) => b.textContent && !b.textContent.includes(targetWord) && /^[1-4]/.test(b.textContent)
    );
    expect(wrongButtons.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(wrongButtons[0]);
    fireEvent.click(wrongButtons[1]);
    fireEvent.click(wrongButtons[2]);

    // Wait for 800ms game over overlay timer
    act(() => vi.advanceTimersByTime(900));
    expect(screen.getByRole("heading", { name: "GAME OVER" })).toBeInTheDocument();
    // Verify Xem kết quả is NOT rendered on Game Over
    expect(screen.queryByRole("button", { name: /xem kết quả/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thử lại/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thoát/i })).toBeInTheDocument();

    // Click THỬ LẠI to restart
    fireEvent.click(screen.getByRole("button", { name: /thử lại/i }));
    // Game is restarted fresh with 3 lives and no game over
    expect(screen.queryByRole("heading", { name: "GAME OVER" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Còn 3 mạng")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });
  it("targets word on pointer enter and does not show 'Chưa khớp' notice banner on wrong answer", () => {
    vi.useFakeTimers();
    mockSoundContext();
    const pool = [
      { id: 1, word: "targetWord", meaning: "targetMeaning", mastered: false },
      { id: 2, word: "otherWord1", meaning: "otherMeaning1", mastered: false },
      { id: 3, word: "otherWord2", meaning: "otherMeaning2", mastered: false },
      { id: 4, word: "otherWord3", meaning: "otherMeaning3", mastered: false },
    ];
    render(<VocabularyArcade words={pool} mode="blast" muted onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu chơi" }));

    // Find the button for otherWord1
    const targetBtn = screen.getByRole("button", { name: /otherWord1/i });
    expect(targetBtn).not.toHaveAttribute("data-targeted");

    // Pointer enter triggers targeting
    fireEvent.pointerEnter(targetBtn);
    expect(targetBtn).toHaveAttribute("data-targeted", "true");

    // Pointer leave removes targeting
    fireEvent.pointerLeave(targetBtn);
    expect(targetBtn).not.toHaveAttribute("data-targeted");

    // Click a wrong answer (pool has targetWord vs otherWord1)
    const clueMeaning = screen.getByRole("heading", { level: 3 }).textContent;
    const targetWord = pool.find((p) => p.meaning === clueMeaning)!.word;
    const wrongBtn = screen.getAllByRole("button").find(
      (b) => b.textContent && !b.textContent.includes(targetWord) && /^[1-4]/.test(b.textContent)
    )!;
    fireEvent.click(wrongBtn);

    // Life is reduced by 1
    expect(screen.getByLabelText("Còn 2 mạng")).toBeInTheDocument();

    // Verify 'Chưa khớp, thử lại nhé.' banner is NOT in the document!
    expect(screen.queryByText(/chưa khớp/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

