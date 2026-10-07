import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultDashboardPreferences, type DashboardMetrics, type DashboardPreferences, type DashboardStats, type DashboardView } from "@/lib/dashboard-model";
import DashboardClient from "./DashboardClient";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));

function fixture(): DashboardView {
  const today: DashboardMetrics = { reading: 7, listening: 30, vocab: 5, practice: 0, video: 0, writing: 1, speaking: null, studySeconds: 120, activities: 5, xp: 100 };
  return { greetingName: "An", todayDateKey: "2026-10-07", preferences: { ...defaultDashboardPreferences(), currentScore: 500 }, today, stats: { ...today }, streakDays: 3, longestStreakDays: 7, totalXp: 900 };
}
function response<T>(data: T, ok = true): Response {
  return { ok, json: async () => ({ success: ok, data, error: ok ? null : "Chưa lưu được cài đặt" }) } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function rangeStats(reading: number): DashboardStats {
  return { metrics: { ...fixture().stats, reading }, start: "2026-10-05", end: "2026-10-07" };
}
const readingCard = () => screen.getByRole("button", { name: "Chi tiết Đọc" });
const goalInput = (dialog: HTMLElement, key: string) => dialog.querySelector<HTMLInputElement>(`#goal-${key}`)!;
const body = (call: number) => JSON.parse(vi.mocked(fetch).mock.calls[call][1]?.body as string);

beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("personal dashboard", () => {
  it("keeps today's goal rows and progress unchanged while fetching another period", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    render(<DashboardClient initial={fixture()} />);
    const goals = screen.getByRole("region", { name: "Mục tiêu hôm nay" });
    const readingRow = within(goals).getByRole("link", { name: /Đọc/ });
    fireEvent.click(screen.getByRole("button", { name: "Tuần" }));
    expect(screen.getByText("Đang tải thống kê…")).toBeInTheDocument();
    expect(within(goals).getByRole("link", { name: /Đọc/ })).toBe(readingRow);
    expect(readingRow).toHaveTextContent("7/30 câu");
    expect(within(goals).getByRole("progressbar", { name: "Mục tiêu Nghe" })).toHaveAttribute("aria-valuenow", "30");
    expect(within(goals).getByRole("progressbar", { name: "Mục tiêu Đọc" })).toHaveAttribute("aria-valuemax", "30");
    await act(async () => pending.resolve(response(rangeStats(44))));
    expect(readingRow).toHaveTextContent("7/30 câu");
    expect(within(readingCard()).getByText("44 câu")).toBeInTheDocument();
  });

  it("ignores stale filter responses after selecting another period", async () => {
    const week = deferred<Response>();
    const month = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(week.promise).mockReturnValueOnce(month.promise);
    render(<DashboardClient initial={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tuần" }));
    fireEvent.click(screen.getByRole("button", { name: "Tháng" }));
    expect((vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    await act(async () => month.resolve(response(rangeStats(99))));
    expect(within(readingCard()).getByText("99 câu")).toBeInTheDocument();
    await act(async () => week.resolve(response(rangeStats(44))));
    expect(within(readingCard()).getByText("99 câu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tháng" })).toHaveAttribute("aria-pressed", "true");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("renders weekly results and reuses today's initial data and the weekly cache", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(rangeStats(44)));
    render(<DashboardClient initial={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tuần" }));
    await waitFor(() => expect(within(readingCard()).getByText("44 câu")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/dashboard/stats?period=week", expect.objectContaining({ cache: "no-store" }));
    fireEvent.click(screen.getByRole("button", { name: "Hôm nay" }));
    expect(within(readingCard()).getByText("7 câu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tuần" }));
    expect(within(readingCard()).getByText("44 câu")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps the applied custom range for retries and reopening after canceling a new draft", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(null, false)).mockResolvedValueOnce(response({ ...rangeStats(44), start: "2026-10-01", end: "2026-10-05" }));
    render(<DashboardClient initial={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
    let dialog = screen.getByRole("dialog", { name: "Khoảng thời gian tùy chỉnh" });
    fireEvent.change(within(dialog).getByLabelText("Từ ngày"), { target: { value: "2026-10-01" } });
    fireEvent.change(within(dialog).getByLabelText("Đến ngày"), { target: { value: "2026-10-05" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xem thống kê" }));
    await screen.findByRole("button", { name: "Thử lại" });
    const appliedUrl = "/api/dashboard/stats?period=custom&start=2026-10-01&end=2026-10-05";
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(appliedUrl);

    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Từ ngày"), { target: { value: "2026-10-02" } });
    fireEvent.change(within(dialog).getByLabelText("Đến ngày"), { target: { value: "2026-10-03" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(within(readingCard()).getByText("44 câu")).toBeInTheDocument());
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe(appliedUrl);
    expect(screen.getByText("01/10/2026 – 05/10/2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tùy chỉnh" }));
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Từ ngày")).toHaveValue("2026-10-01");
    expect(within(dialog).getByLabelText("Đến ngày")).toHaveValue("2026-10-05");
  });

  it("keeps the preference dialog and edited draft after a failed save", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(null, false));
    render(<DashboardClient initial={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cài đặt mục tiêu hằng ngày" }));
    const dialog = screen.getByRole("dialog", { name: "Cài đặt mục tiêu hằng ngày" });
    fireEvent.change(goalInput(dialog, "reading"), { target: { value: "45" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu mục tiêu" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Chưa lưu được cài đặt");
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(goalInput(dialog, "reading")).toHaveValue(45);
    expect(screen.getByRole("progressbar", { name: "Mục tiêu Đọc" })).toHaveAttribute("aria-valuemax", "30");
    expect(within(dialog).getByRole("button", { name: "Lưu mục tiêu" })).toBeEnabled();
  });

  it("updates goal progress denominators and enabled rows after a successful save", async () => {
    const initial = fixture();
    const preferences: DashboardPreferences = structuredClone(initial.preferences);
    preferences.dailyGoals.reading.target = 7;
    preferences.dailyGoals.video.enabled = false;
    vi.mocked(fetch).mockResolvedValueOnce(response(preferences));
    render(<DashboardClient initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Cài đặt mục tiêu hằng ngày" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(goalInput(dialog, "reading"), { target: { value: "7" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Bật mục tiêu Video" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu mục tiêu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body(0)).toEqual({ dailyGoals: preferences.dailyGoals });
    expect(screen.getByRole("progressbar", { name: "Mục tiêu Đọc" })).toHaveAttribute("aria-valuemax", "7");
    expect(screen.getByRole("progressbar", { name: "Mục tiêu Đọc" })).toHaveAttribute("aria-valuenow", "7");
    expect(screen.queryByRole("progressbar", { name: "Mục tiêu Video" })).not.toBeInTheDocument();
    const goals = screen.getByRole("region", { name: "Mục tiêu hôm nay" });
    expect(goals).toHaveTextContent("2/4");
  });

  it.each(["", "401", "1.5"])("validates an enabled invalid target %j and restores its saved value when disabling", async (invalidTarget) => {
    const initial = fixture();
    const saved = structuredClone(initial.preferences);
    saved.dailyGoals.vocab.enabled = false;
    vi.mocked(fetch).mockResolvedValueOnce(response(saved));
    render(<DashboardClient initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Cài đặt mục tiêu hằng ngày" }));
    const dialog = screen.getByRole("dialog");
    const input = goalInput(dialog, "vocab");
    fireEvent.change(input, { target: { value: invalidTarget } });
    expect(input.checkValidity()).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu mục tiêu" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Bật mục tiêu Từ vựng" }));
    expect(input).toBeDisabled();
    expect(input).toHaveValue(20);
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu mục tiêu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body(0).dailyGoals.vocab).toEqual({ enabled: false, target: 20 });
  });

  it("unlocks a timed-out preference dialog, retains its draft, and permits closing", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    render(<DashboardClient initial={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cài đặt mục tiêu hằng ngày" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(goalInput(dialog, "reading"), { target: { value: "45" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu mục tiêu" }));
    expect(within(dialog).getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Đóng" })).toBeDisabled();
    expect(goalInput(dialog, "reading")).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Kết nối mất quá lâu");
    expect(goalInput(dialog, "reading")).toHaveValue(45);
    expect(goalInput(dialog, "reading")).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Lưu mục tiêu" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Đóng" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Mục tiêu Đọc" })).toHaveAttribute("aria-valuemax", "30");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("submits numeric TOEIC scores and reflects the saved target", async () => {
    const initial = fixture();
    vi.mocked(fetch).mockResolvedValueOnce(response({ ...initial.preferences, currentScore: 600, targetScore: 850 }));
    render(<DashboardClient initial={initial} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Điểm thi thử hiện tại" }), { target: { value: "600" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Điểm mục tiêu" }), { target: { value: "850" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu điểm" }));
    await screen.findByText("Đã lưu điểm");
    expect(body(0)).toEqual({ currentScore: 600, targetScore: 850 });
    expect(screen.getByText("+250")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu điểm" })).toBeDisabled();
  });

  it("persists adding and removing the exam date", async () => {
    const initial = fixture();
    const withExam = { ...initial.preferences, examDate: "2026-10-17" };
    vi.mocked(fetch).mockResolvedValueOnce(response(withExam)).mockResolvedValueOnce(response(initial.preferences));
    render(<DashboardClient initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Đặt ngày thi" }));
    const dialog = screen.getByRole("dialog", { name: "Đặt ngày thi TOEIC" });
    fireEvent.change(within(dialog).getByLabelText("Ngày thi dự kiến"), { target: { value: "2026-10-17" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu ngày thi" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body(0)).toEqual({ examDate: "2026-10-17" });
    expect(screen.getByText("Ngày thi · 17/10/2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Đổi ngày thi" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Xóa ngày thi" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(body(1)).toEqual({ examDate: null });
    expect(screen.getByText("Chưa đặt ngày thi")).toBeInTheDocument();
  });

  it("retains the entered exam date and open dialog when persistence fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(null, false));
    render(<DashboardClient initial={fixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Đặt ngày thi" }));
    const dialog = screen.getByRole("dialog", { name: "Đặt ngày thi TOEIC" });
    const input = within(dialog).getByLabelText("Ngày thi dự kiến");
    fireEvent.change(input, { target: { value: "2026-10-17" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu ngày thi" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Chưa lưu được cài đặt");
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(input).toHaveValue("2026-10-17");
    expect(screen.getByText("Chưa đặt ngày thi")).toBeInTheDocument();
  });
});
