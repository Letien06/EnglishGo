import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    fireEvent.click(screen.getByRole("tab", { name: /xem từ/i }));
    expect(screen.getByRole("dialog", { name: "Rời phiên hiện tại?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ở lại học tiếp" }));
    expect(screen.getByRole("button", { name: "Bắt đầu chơi" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /xem từ/i }));
    fireEvent.click(screen.getByRole("button", { name: "Rời phiên" }));
    expect(screen.getByRole("tab", { name: /xem từ/i })).toHaveAttribute("aria-selected", "true");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows entering room code manually from Hub to join multiplayer lobby", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: { room: { code: "ABC123" } } }), { status: 200 })));
    render(
      <FlashcardGame
        session={session}
        initialMode="menu"
        initialTab="play"
        practiceOptions={[]}
        reviewMode={false}
        isAuthenticated={true}
        loginHref="/login"
      />
    );
    expect(screen.getByText("Đấu từ vựng cùng bạn bè")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nhập mã phòng/i }));
    expect(screen.getByRole("dialog", { name: /Nhập mã phòng/i })).toBeInTheDocument();

    const input = screen.getByPlaceholderText("VD: 7CWB2A");
    fireEvent.change(input, { target: { value: "abc123" } });
    expect(input).toHaveValue("ABC123");

    fireEvent.click(screen.getByRole("button", { name: "Vào phòng" }));
    // Modal closes and user transitions to play mode
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Nhập mã phòng/i })).not.toBeInTheDocument();
    });
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

