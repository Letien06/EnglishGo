import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicPartTest } from "@/types/dautoeic";
import { setActiveLearnerId } from "@/lib/client-learning-progress-cache";
import ListeningDashboard from "./ListeningDashboard";
import ListeningLoading from "./ListeningLoading";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }) }));

const tests: DauToeicPartTest[] = [
  { testId: "test1", testName: "Test 1", setName: "Bộ đề 1", part: 1, questionCount: 6, itemCount: 6, done: 2, correct: 1, wrong: 1, nextIndex: 2 },
  { testId: "test2", testName: "Test 2", setName: "Bộ đề 1", part: 1, questionCount: 6, itemCount: 6, done: 0, correct: 0, wrong: 0, nextIndex: 0 },
  { testId: "test3", testName: "Test 3", setName: "Bộ đề 1", part: 1, questionCount: 6, itemCount: 6, done: 6, correct: 5, wrong: 1, nextIndex: 0 },
];
const defaults = { tests, part: 1, initialError: false, progressError: false, progressReady: true, authenticated: false };

beforeEach(() => { vi.stubGlobal("React", React); window.localStorage.clear(); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("listening dashboard UI", () => {
  it("uses the complete reading dashboard shell while its catalog loads", () => {
    render(<ListeningLoading skill="reading" />);
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { name: "Luyện đọc." })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Các phần luyện đọc" })).getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Đang tải bài luyện tập" })).toBeInTheDocument();
    expect(screen.queryByText("Part này chưa có bài đọc")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Các phần luyện nghe" })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the progress status and resume metadata slots mounted after data arrives", () => {
    const { rerender } = render(<ListeningDashboard {...defaults} progressReady={false} />);
    const noticeSlot = screen.getByRole("status").parentElement;
    const hero = screen.getByRole("region", { name: "Tổng quan luyện nghe" });
    const resumeSource = hero.querySelector('span[aria-hidden="true"]');
    rerender(<ListeningDashboard {...defaults} />);
    expect(noticeSlot).toBeInTheDocument();
    expect(screen.queryByText("Đang tải tiến độ cá nhân. Bạn có thể bắt đầu bài ngay.")).not.toBeInTheDocument();
    expect(screen.getByText("Bộ đề 1 · Đã làm 2/6 câu")).toBeInTheDocument();
    expect(screen.getByText("Bộ đề 1 · Đã làm 2/6 câu")).toBe(resumeSource);
  });
  it("renders Reading Parts and keeps the reading reset endpoint", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
    render(<ListeningDashboard {...defaults} skill="reading" part={5} tests={tests.map((test) => ({ ...test, part: 5 }))} />);
    expect(screen.getByRole("heading", { name: "Luyện đọc." })).toBeInTheDocument();
    expect(screen.getByText("Test 1 · Part 5 · câu 3/6")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp tục học Test 1 - Bộ đề 1" })).toHaveAttribute("href", "/read/practice?part=part5&testId=test1&mode=normal&q=2");
    expect(screen.getByRole("link", { name: "Part 7: Đọc hiểu" })).toHaveAttribute("href", "/read?part=part7");
    expect(screen.queryByRole("link", { name: "Nghe - chép video" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("article", { name: "Test 1 - Bộ đề 1" })).getByRole("button", { name: "Làm lại" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/reading/reset", expect.objectContaining({ method: "POST", body: JSON.stringify({ part: 5, level: 1, testId: "test1" }) })));
  });
  it("sorts by source year and displays source difficulty without changing test data", () => {
    render(<ListeningDashboard {...defaults} metadata={{ test1: { year: 2024, difficultyLevel: 3 }, test2: { year: 2026, difficultyLevel: 2 } }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Sắp xếp test" }), { target: { value: "newest" } });
    expect(screen.getAllByRole("article")[0]).toHaveAccessibleName("Test 2 - Bộ đề 1");
    expect(within(screen.getAllByRole("article")[0]).getByText("Mức 2")).toBeInTheDocument();
    expect(within(screen.getAllByRole("article")[0]).getByText("Năm 2026")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shows a real resume position, accessible progress and existing routes", () => {
    render(<ListeningDashboard {...defaults} />);
    expect(screen.getByText("Test 1 · Part 1 · câu 3/6")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiếp tục học Test 1 - Bộ đề 1" })).toHaveAttribute("href", "/listen/practice?part=part1&testId=test1&mode=normal&q=2");
    expect(screen.getByRole("progressbar", { name: "Tiến độ Test 1 - Bộ đề 1" })).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByRole("link", { name: "Ôn lại Test 3 - Bộ đề 1" })).toHaveAttribute("href", "/listen/practice?part=part1&testId=test3&mode=normal&q=0");
    expect(screen.getByRole("link", { name: "Part 1: Hình ảnh" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Nghe - chép video" })).toHaveAttribute("href", "/listen/dictation");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("filters, searches, clears empty results and sorts without a request", () => {
    render(<ListeningDashboard {...defaults} />);
    fireEvent.click(screen.getByRole("button", { name: "Đang học 1" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tất cả 3" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sắp xếp test" }), { target: { value: "progress-desc" } });
    expect(screen.getAllByRole("article")[0]).toHaveAccessibleName("Test 3 - Bộ đề 1");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bo de" } });
    expect(screen.getAllByRole("article")).toHaveLength(3);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "không tồn tại" } });
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText("Chưa tìm thấy bài nghe phù hợp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps links available while progress is pending and never presents unknown counts as zero", () => {
    render(<ListeningDashboard {...defaults} progressReady={false} />);
    expect(screen.getByRole("button", { name: "Đang học —" })).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "Tiến độ Test 1 - Bộ đề 1" })).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByRole("link", { name: /Bắt đầu bài nghe/ })).toBeInTheDocument();
    expect(screen.queryByText("Tiếp tục nhịp học của bạn")).not.toBeInTheDocument();
  });
  it("preserves the reset contract and confirms before deleting progress", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);
    render(<ListeningDashboard {...defaults} />);
    fireEvent.click(within(screen.getByRole("article", { name: "Test 1 - Bộ đề 1" })).getByRole("button", { name: "Làm lại" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/listening/reset", expect.objectContaining({ method: "POST", body: JSON.stringify({ part: 1, level: 1, testId: "test1" }) })));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Test 1 - Bộ đề 1"));
  });
  it("reads the existing streak API and clears it on account change", async () => {
    setActiveLearnerId("listen-streak-user");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { authenticated: true, streakDays: 7, studiedToday: true } }) } as Response)
      .mockImplementationOnce(() => new Promise(() => undefined));
    render(<ListeningDashboard {...defaults} authenticated />);
    await waitFor(() => expect(screen.getByText("Hôm nay đã học. Giữ nhịp nhé!")).toBeInTheDocument());
    act(() => setActiveLearnerId("other-user"));
    expect(screen.queryByText("Hôm nay đã học. Giữ nhịp nhé!")).not.toBeInTheDocument();
  });
  it("renders a catalog error and a zero-test empty state without invented data", () => {
    const { rerender } = render(<ListeningDashboard {...defaults} tests={[]} initialError />);
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa tải được danh sách test");
    rerender(<ListeningDashboard {...defaults} tests={[]} />);
    expect(screen.getByText("Part này chưa có bài nghe")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Bắt đầu bài nghe/ })).not.toBeInTheDocument();
  });
});
