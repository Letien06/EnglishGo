import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FlashcardGame from "./FlashcardGame";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const session = { set: { id: 1, title: "Test", topic: "Words" }, words: [{ id: 1, word: "carry", meaning: "mang", mastered: false }] };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("new vocabulary modes integrate with results", () => {
  it("keeps the new round local and retries failed history without saving reviews twice", async () => {
    let historyCalls = 0;
    const fetcher = vi.fn(async (url: string) => {
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
    expect(fetcher).toHaveBeenCalledWith("/api/vocab/reviews/batch", expect.objectContaining({ body: JSON.stringify({ reviews: [{ wordId: 1, quality: 4 }] }) }));
    fireEvent.click(screen.getByRole("button", { name: /Lưu & Hoàn thành/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu kết quả"));
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/vocab/reviews/batch")).toHaveLength(1);
    expect(historyCalls).toBe(2);
  });

  it("guards tab navigation with an accessible cancelable dialog", async () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<FlashcardGame session={session} initialMode="blast" practiceOptions={[]} reviewMode={false} isAuthenticated={false} loginHref="/login" />);
    await screen.findByRole("button", { name: "Bắt đầu chơi" });
    fireEvent.click(screen.getByRole("tab", { name: "Xem từ" }));
    expect(screen.getByRole("dialog", { name: "Rời phiên hiện tại?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ở lại học tiếp" }));
    expect(screen.getByRole("button", { name: "Bắt đầu chơi" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Xem từ" }));
    fireEvent.click(screen.getByRole("button", { name: "Rời phiên" }));
    expect(screen.getByRole("tab", { name: "Xem từ" })).toHaveAttribute("aria-selected", "true");
    expect(fetch).not.toHaveBeenCalled();
  });
});
