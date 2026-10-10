import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContextLearning from "./ContextLearning";

vi.mock("../useVocabularyAudio", () => ({ default: () => ({ speak: vi.fn(), speakWord: vi.fn(), stop: vi.fn() }) }));

const queue = vi.hoisted(() => ({ enqueue: vi.fn(), pendingReviews: [], masteryByWordId: new Map<number, boolean>(), pendingCount: 0, error: null as string | null, retry: vi.fn(), isSaving: false, reconcile: vi.fn(), flush: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/vocab-review-queue", () => ({ useVocabReviewQueue: () => queue }));

describe("context learning", () => {
  beforeEach(() => {
    queue.enqueue.mockReset();
    queue.retry.mockReset();
    queue.masteryByWordId = new Map();
    queue.error = null;
    queue.pendingCount = 0;
    queue.isSaving = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  it.each([["Học lại", 1], ["Khó", 2], ["Tốt", 4], ["Dễ", 5]] as const)(
    "opens the rating screen without saving, then queues the selected %s quality",
    (label, quality) => {
      const onComplete = vi.fn();
      render(<ContextLearning words={[{ id: 1, word: "carry", meaning: "mang", mastered: false }]} onComplete={onComplete} onExit={vi.fn()} />);
      fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
      expect(screen.getByRole("button", { name: "2. Gõ từ" })).toHaveAttribute("aria-current", "step");
      expect(screen.getByRole("heading", { name: "carry (v)" })).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(queue.enqueue).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(queue.enqueue).toHaveBeenCalledExactlyOnceWith({ wordId: 1, quality });
      expect(onComplete).toHaveBeenCalledOnce();
    },
  );
  it("opens the same rating screen from the flipped-card mastery action", () => {
    render(<ContextLearning words={[{ id: 1, word: "carry", meaning: "mang", mastered: false }]} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Lật thẻ học" }));
    fireEvent.click(screen.getByRole("button", { name: "✓Đã thuộc" }));
    expect(screen.getByRole("button", { name: "Dễ" })).toBeInTheDocument();
    expect(queue.enqueue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Gõ lại" }));
    expect(screen.getByRole("textbox", { name: "Gõ từ tiếng Anh" })).toHaveFocus();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
  it("offers word, phrase, example and typing steps without extra requests", async () => {
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
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ score: 0, answers: [expect.objectContaining({ correct: false, expected: "carry" })] }));
  });
  it("allows exiting without submitting progress", () => {
    const onComplete = vi.fn();
    const onExit = vi.fn();
    render(<ContextLearning words={[{ id: 1, word: "carry", meaning: "mang", mastered: false }]} onComplete={onComplete} onExit={onExit} />);
    fireEvent.click(screen.getByRole("button", { name: "Thoát phiên học" }));
    expect(onExit).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("auto-resumes from first unmastered word and shows resume notice", () => {
    const words = [
      { id: 1, word: "apple", meaning: "quả táo", mastered: true },
      { id: 2, word: "banana", meaning: "quả chuối", mastered: true },
      { id: 3, word: "cherry", meaning: "quả anh đào", mastered: false },
    ];
    render(<ContextLearning words={words} onComplete={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByText(/Đang tiếp tục từ từ chưa học/)).toBeInTheDocument();
    expect(screen.getByText("cherry")).toBeInTheDocument();
    expect(screen.getByText("CHƯA THUỘC")).toBeInTheDocument();
  });

  it("opens word drawer and allows jumping to any word", () => {
    const words = [
      { id: 1, word: "apple", meaning: "quả táo", mastered: true },
      { id: 2, word: "banana", meaning: "quả chuối", mastered: false },
    ];
    render(<ContextLearning words={words} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Mở danh sách toàn bộ từ và kiểm soát tiến độ"));
    expect(screen.getByRole("dialog", { name: "Danh sách từ vựng" })).toBeInTheDocument();
    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();

    // Click on apple (#1) to jump to it
    fireEvent.click(screen.getByText("quả táo"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.getByText("ĐÃ THUỘC")).toBeInTheDocument();
  });

  it("allows in-study filtering by unmastered and mastered words", () => {
    const words = [
      { id: 1, word: "apple", meaning: "quả táo", mastered: true },
      { id: 2, word: "banana", meaning: "quả chuối", mastered: false },
    ];
    render(<ContextLearning words={words} onComplete={vi.fn()} onExit={vi.fn()} />);

    // Filter by 'Đã thuộc (1)'
    fireEvent.click(screen.getByRole("button", { name: /Đã thuộc \(1\)/ }));
    expect(screen.getByText("apple")).toBeInTheDocument();
    expect(screen.getByText("ĐÃ THUỘC")).toBeInTheDocument();

    // Filter by 'Chưa thuộc (1)'
    fireEvent.click(screen.getByRole("button", { name: /Chưa thuộc \(1\)/ }));
    expect(screen.getByText("banana")).toBeInTheDocument();
    expect(screen.getByText("CHƯA THUỘC")).toBeInTheDocument();
  });

  it("continues through interleaved unmastered words and requeues rated cards once", async () => {
    const onComplete = vi.fn();
    render(<ContextLearning words={[
      { id: 1, word: "apple", meaning: "táo", mastered: true },
      { id: 2, word: "banana", meaning: "chuối", mastered: false },
      { id: 3, word: "cherry", meaning: "anh đào", mastered: true },
      { id: 4, word: "date", meaning: "chà là", mastered: false },
      { id: 5, word: "elderberry", meaning: "cơm cháy", mastered: false },
    ]} onComplete={onComplete} onExit={vi.fn()} />);
    const card = () => screen.getByRole("button", { name: "Lật thẻ học" });
    expect(card()).toHaveTextContent("banana");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Học lại" }));
    await waitFor(() => expect(card()).toHaveTextContent("date"));
    fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Học lại" }));
    await waitFor(() => expect(card()).toHaveTextContent("elderberry"));
    fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Học lại" }));
    // Rated cards stay at the end for one reinforcement pass.
    expect(card()).toHaveTextContent("banana");
    for (const expected of ["banana", "date", "elderberry"]) {
      expect(card()).toHaveTextContent(expected);
      fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
      fireEvent.click(screen.getByRole("button", { name: "Học lại" }));
    }
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      answers: ["banana", "date", "elderberry", "banana", "date", "elderberry"].map((expected) => expect.objectContaining({ expected })),
    }));
    expect(screen.getByText("Đã hoàn thành phiên học.")).toBeInTheDocument();
  });

  it("shows completion and a review action without restarting a mastered deck", () => {
    const onReview = vi.fn();
    render(<ContextLearning words={[{ id: 1, word: "apple", meaning: "táo", mastered: true }]} onComplete={vi.fn()} onExit={vi.fn()} onReview={onReview} />);
    expect(screen.getByText("Bạn đã thuộc tất cả từ trong phần này.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lật thẻ học" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ôn tập từ đã thuộc" }));
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("reviews mastered words in incoming order and saves only actual review", async () => {
    render(<ContextLearning studyIntent="review" words={[
      { id: 3, word: "cherry", meaning: "anh đào", mastered: true },
      { id: 1, word: "apple", meaning: "táo", mastered: true },
    ]} onComplete={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("cherry");
    expect(screen.getByText("ĐÃ THUỘC")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Đã thuộc từ này"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("apple"));
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ wordId: 3, quality: 4 }));
  });

  it("keeps the current word stable when a preceding drawer word is mastered", async () => {
    render(<ContextLearning words={[
      { id: 1, word: "apple", meaning: "táo", mastered: false },
      { id: 2, word: "banana", meaning: "chuối", mastered: false },
      { id: 3, word: "cherry", meaning: "anh đào", mastered: false },
    ]} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Từ tiếp →" }));
    fireEvent.click(screen.getByTitle("Mở danh sách toàn bộ từ và kiểm soát tiến độ"));
    fireEvent.click(screen.getAllByTitle("Đánh dấu đã thuộc")[1]);
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ wordId: 1, mastered: true }));
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
  });

  it("allows deliberately unmarking persisted mastery from the drawer", async () => {
    render(<ContextLearning studyIntent="review" words={[{ id: 1, word: "apple", meaning: "táo", mastered: true }]} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Mở danh sách toàn bộ từ và kiểm soát tiến độ"));
    fireEvent.click(screen.getByTitle("Bỏ đánh dấu đã thuộc"));
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ wordId: 1, quality: 1 }));
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(screen.getByText("CHƯA THUỘC")).toBeInTheDocument();
    expect(queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ wordId: 1, quality: 1 }));
  });

  it("defers answer persistence when a parent owns the round save", () => {
    const onComplete = vi.fn();
    render(<ContextLearning studyIntent="review" persistAnswers={false} words={[{ id: 1, word: "apple", meaning: "táo", mastered: true }]} onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Đã thuộc từ này"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    expect(fetch).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith({ score: 10, answers: [expect.objectContaining({ correct: true })] });
  });

  it("never substitutes unmastered words for an empty mastered filter", async () => {
    const onContinue = vi.fn();
    render(<ContextLearning words={[{ id: 1, word: "apple", meaning: "táo", mastered: false }]} onComplete={vi.fn()} onExit={vi.fn()} onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: "Đã thuộc (0)" }));
    expect(screen.getByText("Chưa có từ phù hợp để học.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lật thẻ học" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Học tiếp bộ này" }));
    expect(onContinue).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Xem tất cả từ" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("apple"));
  });

  it("shows completion after rating the sole remaining word", async () => {
    const onComplete = vi.fn();
    render(<ContextLearning words={[
      { id: 1, word: "apple", meaning: "táo", mastered: true },
      { id: 2, word: "banana", meaning: "chuối", mastered: false },
    ]} onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(screen.getByText("Đã hoàn thành phiên học.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lật thẻ học" })).not.toBeInTheDocument();
    expect(screen.queryByText("apple")).not.toBeInTheDocument();
  });

  it("explains when no mastered words are available for review", () => {
    render(<ContextLearning studyIntent="review" words={[]} onComplete={vi.fn()} onExit={vi.fn()} />);
    expect(screen.getByText("Chưa có từ đã thuộc để ôn.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("advances immediately while saving is pending and retry does not change the next word", () => {
    queue.enqueue.mockImplementation(() => new Promise(() => {}));
    const onComplete = vi.fn();
    const words = [{ id: 1, word: "apple", meaning: "táo", mastered: false }, { id: 2, word: "banana", meaning: "chuối", mastered: false }];
    const { rerender } = render(<ContextLearning words={words} onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
    expect(onComplete).not.toHaveBeenCalled();
    queue.pendingCount = 1;
    queue.error = "Offline";
    queue.retry();
    rerender(<ContextLearning words={words} onComplete={onComplete} onExit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
    expect(onComplete).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledOnce();
  });

  it("completes after rating and ignores a duplicate rating click on the final word", () => {
    queue.enqueue.mockImplementation(() => new Promise(() => {}));
    const onComplete = vi.fn();
    render(<ContextLearning studyIntent="review" words={[{ id: 1, word: "apple", meaning: "táo", mastered: true }]} onComplete={onComplete} onExit={vi.fn()} />);
    const mark = screen.getByTitle("Đã thuộc từ này");
    fireEvent.click(mark);
    const rating = screen.getByRole("button", { name: "Tốt" });
    fireEvent.click(rating);
    fireEvent.click(rating);
    expect(queue.enqueue).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledOnce();
    queue.retry();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("finishes the final review with visible completion actions", async () => {
    const onContinue = vi.fn();
    render(<ContextLearning studyIntent="review" words={[{ id: 1, word: "apple", meaning: "táo", mastered: true }]} onComplete={vi.fn()} onExit={vi.fn()} onContinue={onContinue} />);
    fireEvent.click(screen.getByTitle("Đã thuộc từ này"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    expect(await screen.findByText("Đã hoàn thành phiên ôn.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lật thẻ học" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Học tiếp bộ này" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("allows anonymous mastery and reviews without sending writes", () => {
    const onComplete = vi.fn();
    render(<ContextLearning isAuthenticated={false} studyIntent="review" words={[{ id: 1, word: "apple", meaning: "táo", mastered: true }]} onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Mở danh sách toàn bộ từ và kiểm soát tiến độ"));
    fireEvent.click(screen.getByTitle("Bỏ đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(screen.getByText("CHƯA THUỘC")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    expect(onComplete).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("starts a fresh round after viewing all words from completion", () => {
    const onComplete = vi.fn();
    render(<ContextLearning studyIntent="review" persistAnswers={false} words={[
      { id: 1, word: "apple", meaning: "táo", mastered: true },
      { id: 2, word: "banana", meaning: "chuối", mastered: true },
    ]} onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Đã thuộc từ này"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    fireEvent.click(screen.getByTitle("Đã thuộc từ này"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    expect(onComplete).toHaveBeenLastCalledWith({ score: 20, answers: [expect.objectContaining({ expected: "apple" }), expect.objectContaining({ expected: "banana" })] });
    fireEvent.click(screen.getByRole("button", { name: "Xem tất cả từ" }));
    expect(screen.getByText("+0")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Đã thuộc từ này"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    fireEvent.click(screen.getByTitle("Đã thuộc từ này"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith({ score: 20, answers: [expect.objectContaining({ expected: "apple" }), expect.objectContaining({ expected: "banana" })] });
  });

  it("returns to the first unmastered word without restarting mastered words", () => {
    render(<ContextLearning words={[
      { id: 1, word: "apple", meaning: "táo", mastered: true },
      { id: 2, word: "banana", meaning: "chuối", mastered: false },
      { id: 3, word: "cherry", meaning: "anh đào", mastered: false },
    ]} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Từ tiếp →" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("cherry");
    fireEvent.click(screen.getByRole("button", { name: "Về từ chưa thuộc đầu tiên" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the next cursor stable through queue acknowledgement and stale server flags", () => {
    const words = [
      { id: 1, word: "apple", meaning: "táo", mastered: false },
      { id: 2, word: "banana", meaning: "chuối", mastered: false },
      { id: 3, word: "cherry", meaning: "anh đào", mastered: false },
    ];
    const onComplete = vi.fn();
    const { rerender } = render(<ContextLearning words={words} onComplete={onComplete} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
    fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
    queue.masteryByWordId = new Map([[1, true]]);
    rerender(<ContextLearning words={words} onComplete={onComplete} onExit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
    queue.masteryByWordId = new Map();
    rerender(<ContextLearning words={words.map((word) => ({ ...word }))} onComplete={onComplete} onExit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
    // Selecting a filter starts that filtered deck from its first word.
    fireEvent.click(screen.getByRole("button", { name: "Chưa thuộc (3)" }));
    expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("apple");
  });

  it("updates drawer mastery immediately without waiting for a save", () => {
    queue.enqueue.mockImplementation(() => new Promise(() => {}));
    render(<ContextLearning studyIntent="review" words={[{ id: 1, word: "apple", meaning: "táo", mastered: true }]} onComplete={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Mở danh sách toàn bộ từ và kiểm soát tiến độ"));
    fireEvent.click(screen.getByTitle("Bỏ đánh dấu đã thuộc"));
    expect(within(screen.getByRole("dialog", { name: "Danh sách từ vựng" })).getByTitle("Đánh dấu đã thuộc")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(screen.getByText("CHƯA THUỘC")).toBeInTheDocument();
  });
});
