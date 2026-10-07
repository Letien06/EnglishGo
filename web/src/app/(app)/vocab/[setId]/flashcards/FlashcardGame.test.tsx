import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FlashcardGame from "./FlashcardGame";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const session = { set: { id: 1, title: "Test", topic: "Words" }, words: [{ id: 1, word: "carry", meaning: "mang", mastered: false }] };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("new vocabulary modes integrate with results", () => {
  it("keeps the new round local and retries failed history without saving reviews twice", async () => {
    let historyCalls = 0;
    const fetcher = vi.fn(async (url: string, _options?: RequestInit) => {
      void _options;
      if (url === "/api/vocab/reviews/batch") return new Response("{}", { status: 200 });
      if (url === "/api/vocab/history") return new Response("{}", { status: ++historyCalls === 1 ? 503 : 201 });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<FlashcardGame session={session} initialMode="learn" practiceOptions={[]} reviewMode={false} isAuthenticated loginHref="/login" />);
    fireEvent.click(await screen.findByRole("button", { name: "2. Gõ từ" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "carry" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    fireEvent.click(screen.getByRole("button", { name: "Từ tiếp theo →" }));
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Lưu & Hoàn thành/ }));
    await screen.findByText("Đã lưu tiến độ từ, nhưng chưa lưu được lịch sử học. Vui lòng thử lại.");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ reviews: [{ wordId: 1, quality: 4 }], requestId: expect.any(String) });
    fireEvent.click(screen.getByRole("button", { name: /Lưu & Hoàn thành/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu kết quả"));
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/vocab/reviews/batch")).toHaveLength(1);
    expect(historyCalls).toBe(2);
    const historyRequests = fetcher.mock.calls.filter(([url]) => url === "/api/vocab/history");
    expect(historyRequests[1][1]?.body).toBe(historyRequests[0][1]?.body);
  });

  it("splits frozen 160-word results and retries the lost chunk unchanged", async () => {
    const reviews = Array.from({ length: 160 }, (_, i) => ({ wordId: i + 1, quality: 4 }));
    const history = { setId: 1, title: "Original title", mode: "Học từ", startedAtMillis: 123456, totalWords: 160, correctWords: 160, wrongWords: 0, accuracy: 100, score: 160, requestId: "stable-history" };
    localStorage.setItem("englishgo-vocab-draft-1-all-learn-wordMeaning", JSON.stringify({ index: 0, score: 160, attempts: 160, answers: [], updatedAtMillis: Date.now(), showResult: true, reviewRequestId: "stable-review", historyRequestId: "stable-history", submission: { reviews, confirmedChunks: 0, history } }));
    let batches = 0;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/vocab/reviews/batch") {
        if (++batches === 2) throw new Error("Lost response");
        return new Response("{}", { status: 200 });
      }
      if (url === "/api/vocab/history") return new Response("{}", { status: 201 });
      throw new Error(`Unexpected request: ${url} ${options?.method}`);
    });
    vi.stubGlobal("fetch", fetcher);
    render(<FlashcardGame session={session} initialMode="learn" practiceOptions={[]} reviewMode={false} isAuthenticated loginHref="/login" />);
    fireEvent.click(await screen.findByRole("button", { name: /Lưu & Hoàn thành/ }));
    await screen.findByText("Không thể lưu kết quả ngay lúc này. Kiểm tra kết nối rồi thử lại.");
    fireEvent.click(screen.getByRole("button", { name: /Lưu & Hoàn thành/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu kết quả"));
    const requests = fetcher.mock.calls.filter(([url]) => url === "/api/vocab/reviews/batch").map(([, options]) => options!.body as string);
    expect(JSON.parse(requests[0])).toEqual({ reviews: reviews.slice(0, 100), requestId: "stable-review-0" });
    expect(JSON.parse(requests[1])).toEqual({ reviews: reviews.slice(100), requestId: "stable-review-1" });
    expect(requests[2]).toBe(requests[1]);
    expect(JSON.parse(fetcher.mock.calls.find(([url]) => url === "/api/vocab/history")![1]!.body as string)).toEqual(history);
  });

  it("uses recall for a single-answer quiz and rejects partial English", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<FlashcardGame session={{ ...session, words: [{ id: 1, word: "office", meaning: "văn phòng", mastered: false }] }} initialMode="quiz" practiceOptions={[]} reviewMode={false} isAuthenticated={false} loginHref="/login" />);
    await screen.findByText("Chưa đủ đáp án khác nhau để trắc nghiệm. Nhìn nghĩa và gõ từ tiếng Anh để luyện nhớ.");
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "off" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    expect(screen.getAllByText(/office/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Chính xác/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("finishes pending server draft writes before deleting the completed draft", async () => {
    localStorage.setItem("englishgo-vocab-draft-1-all-typing-wordMeaning", JSON.stringify({ index: 0, score: 0, attempts: 1, answers: [{ id: 1, word: "carry", meaning: "mang", correct: true }], updatedAtMillis: Date.now(), showResult: true }));
    const operations: string[] = [];
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.startsWith("/api/vocab/game-draft")) {
        if (options?.method === "PUT") {
          await new Promise((resolve) => setTimeout(resolve, 10));
          operations.push("PUT completed");
        } else if (options?.method === "DELETE") operations.push("DELETE");
        return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    render(<FlashcardGame session={session} initialMode="typing" practiceOptions={[]} reviewMode={false} isAuthenticated loginHref="/login" />);
    fireEvent.click(await screen.findByRole("button", { name: /Lưu & Hoàn thành/ }));
    await waitFor(() => expect(operations).toContain("DELETE"));
    expect(operations.at(-1)).toBe("DELETE");
    expect(operations.filter((value) => value === "PUT completed").length).toBeGreaterThan(0);
    expect(localStorage.getItem("englishgo-vocab-draft-1-all-typing-wordMeaning")).toBeNull();
  });

  it("guards tab navigation with an accessible cancelable dialog", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<FlashcardGame session={session} initialMode="blast" practiceOptions={[]} reviewMode={false} isAuthenticated={false} loginHref="/login" />);
    await screen.findByRole("button", { name: "Bắt đầu chơi" }, { timeout: 4000 });
    fireEvent.click(screen.getByRole("tab", { name: /xem từ/i }));
    expect(screen.getByRole("dialog", { name: "Rời phiên hiện tại?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ở lại học tiếp" }));
    expect(screen.getByRole("button", { name: "Bắt đầu chơi" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /xem từ/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rời phiên" }));
    expect(screen.getByRole("tab", { name: /xem từ/i })).toHaveAttribute("aria-selected", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enters play mode immediately when initialRoom prop is provided", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200 })));
    await act(async () => {
      render(
        <FlashcardGame
          session={session}
          initialMode="menu"
          initialRoom="XYZ789"
          practiceOptions={[]}
          reviewMode={false}
          isAuthenticated={true}
          loginHref="/login"
        />
      );
    });
    // When initialRoom is provided, it skips hub and opens play surface directly
    expect(screen.queryByText("Chọn trò chơi")).not.toBeInTheDocument();
  });
});

