import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ContextLearning from "./ContextLearning";

vi.mock("../useVocabularyAudio", () => ({ default: () => ({ speak: vi.fn(), stop: vi.fn() }) }));

describe("context learning", () => {
  it("offers word, phrase, example and typing steps without extra requests", () => {
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
    expect(onComplete).toHaveBeenCalledWith({ score: 0, answers: [expect.objectContaining({ correct: false, expected: "carry" })] });
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
});
