import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedSessionProvider } from "@/components/AuthenticatedSessionContext";
import WritingLibraryClient from "./WritingLibraryClient";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const prompt = { id: "picture", part: 1, title: "Office meeting", titleVi: "Cuộc họp", summary: "Viết về buổi họp.", part1Category: "V_N", tags: ["office"], timeLimitMinutes: 5, difficulty: "BEGINNER", thumbnailUrl: null, requiredTerms: ["discuss", "report"] };
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("writing dashboard", () => {
  it("shows public prompts immediately, retains filters and does not request private history anonymously", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([prompt, { ...prompt, id: "second", title: "Train station", timeLimitMinutes: 3, part1Category: "N_N" }])));
    render(<WritingLibraryClient />);
    await screen.findByRole("heading", { name: "Office meeting" });
    expect(screen.getByRole("link", { name: "Lịch sử bài viết" })).toHaveAttribute("href", "/writing/history");
    expect(screen.getByRole("button", { name: /Đã chấm gần đây/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "V + N 1 câu" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Luyện viết" })).toHaveAttribute("href", "/writing/practice/picture");
    fireEvent.change(screen.getByRole("textbox", { name: "Tìm đề viết" }), { target: { value: "no result" } });
    expect(screen.getByText("Chưa có đề phù hợp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "duration" } });
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Train station");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("loads Part-specific scores without blocking prompts and clears old scores on Part change", async () => {
    let resolveHistory!: (response: Response) => void;
    const fetcher = vi.fn((url: string) => {
      if (url.includes("history?part=1")) return new Promise<Response>((resolve) => { resolveHistory = resolve; });
      if (url.includes("history?part=2")) return Promise.resolve(response([{ promptId: "email", promptPart: 2, submittedAtMillis: 2, feedback: { score: 3, maxScore: 4 } }]));
      return Promise.resolve(response([url.endsWith("part=2") ? { ...prompt, id: "email", part: 2, title: "Reply to a client" } : prompt]));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AuthenticatedSessionProvider authenticated><WritingLibraryClient /></AuthenticatedSessionProvider>);
    await screen.findByRole("heading", { name: "Office meeting" });
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Đang tải điểm cá nhân…")).toBeInTheDocument();
    expect(screen.queryByText("Chưa có điểm gần đây")).not.toBeInTheDocument();
    await act(async () => resolveHistory(response([{ promptId: "picture", promptPart: 1, submittedAtMillis: 1, feedback: { score: 2, maxScore: 3 } }])));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
    fireEvent.click(screen.getByRole("button", { name: /Trả lời email công việc/ }));
    expect(screen.queryByText("Điểm AI: 2/3")).not.toBeInTheDocument();
    await screen.findByRole("heading", { name: "Reply to a client" });
    await waitFor(() => expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75"));
    expect(fetcher).toHaveBeenCalledWith("/api/writing/attempts/history?part=2&limit=30", { cache: "no-store" });
  });

  it("retains a visited Part and its scores during refresh and after refresh failure", async () => {
    let rejectRefresh!: (reason: Error) => void;
    let promptLoads = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.includes("history")) return Promise.resolve(response([{ promptId: "picture", promptPart: 1, submittedAtMillis: 1, feedback: { score: 2, maxScore: 3 } }]));
      if (url.endsWith("part=1") && ++promptLoads === 2) return new Promise<Response>((_resolve, reject) => { rejectRefresh = reject; });
      return Promise.resolve(response([url.endsWith("part=2") ? { ...prompt, id: "email", part: 2, title: "Reply to a client" } : prompt]));
    });
    vi.stubGlobal("fetch", fetcher);
    render(<AuthenticatedSessionProvider authenticated><WritingLibraryClient /></AuthenticatedSessionProvider>);
    await screen.findByText("Điểm AI: 2/3");
    fireEvent.click(screen.getByRole("button", { name: /Trả lời email công việc/ }));
    await screen.findByRole("heading", { name: "Reply to a client" });
    fireEvent.click(screen.getByRole("button", { name: /Viết câu theo tranh/ }));
    expect(screen.getByRole("heading", { name: "Office meeting" })).toBeInTheDocument();
    expect(screen.getByText("Điểm AI: 2/3")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Đang tải đề viết" })).not.toBeInTheDocument();
    await act(async () => rejectRefresh(new Error("Offline")));
    expect(screen.getByRole("heading", { name: "Office meeting" })).toBeInTheDocument();
    expect(screen.getByText(/Chưa cập nhật được thư viện/)).toBeInTheDocument();
  });

  it("clears cached private scores across sign-out and sign-in on the same mount", async () => {
    let historyLoads = 0;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (!url.includes("history")) return Promise.resolve(response([prompt]));
      if (++historyLoads === 1) return Promise.resolve(response([{ promptId: "picture", promptPart: 1, submittedAtMillis: 1, feedback: { score: 2, maxScore: 3 } }]));
      return new Promise<Response>(() => {});
    }));
    const view = render(<AuthenticatedSessionProvider authenticated><WritingLibraryClient /></AuthenticatedSessionProvider>);
    await screen.findByText("Điểm AI: 2/3");
    view.rerender(<AuthenticatedSessionProvider authenticated={false}><WritingLibraryClient /></AuthenticatedSessionProvider>);
    expect(screen.queryByText("Điểm AI: 2/3")).not.toBeInTheDocument();
    view.rerender(<AuthenticatedSessionProvider authenticated><WritingLibraryClient /></AuthenticatedSessionProvider>);
    expect(screen.queryByText("Điểm AI: 2/3")).not.toBeInTheDocument();
    expect(screen.getByText("Đang tải điểm cá nhân…")).toBeInTheDocument();
  });
  it("keeps practice available when private scores fail", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("history") ? Promise.reject(new Error("Offline")) : Promise.resolve(response([prompt]))));
    render(<AuthenticatedSessionProvider authenticated><WritingLibraryClient /></AuthenticatedSessionProvider>);
    await screen.findByRole("heading", { name: "Office meeting" });
    expect(await screen.findByRole("status")).toHaveTextContent("Chưa tải được điểm cá nhân");
    expect(screen.getByRole("link", { name: "Luyện viết" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });
});
