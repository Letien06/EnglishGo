import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DictationLessonView } from "@/lib/services/dictation";
import DictationLessonClient from "./DictationLessonClient";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
const lesson: DictationLessonView = {
  id: "lesson", title: "Listening", sourceName: "Source", sourceUrl: "https://example.com", thumbnailUrl: null,
  durationSeconds: 30, level: "A2", topics: [], segmentCount: 3, publicAttribution: "Source", publishedAtMillis: null,
  youtubeVideoId: "video", embedUrl: "https://www.youtube-nocookie.com/embed/video", accent: null, descriptionVi: null,
  segments: [1, 2, 3].map((index) => ({ id: `s${index}`, index, startSeconds: index * 5, endSeconds: index * 5 + 5, leadInSeconds: 0, tailSeconds: 0, speaker: null, wordCount: 1 })),
};
const response = (data: unknown, ok = true) => ({ ok, json: async () => ({ success: ok, data, error: ok ? undefined : "Không thể tải bài" }) }) as Response;
const prompt = (segmentId = "s1", maskPercent = 30) => ({ segmentId, maskPercent, inputMode: maskPercent === 100 ? "FULL_TEXT" : "BLANKS", prompt: [{ kind: "blank", blankId: "b1", length: 4, hint: "h" }] });
const result = { saved: true, authenticated: true, scorePercent: 100, isCompleted: true, isMastered: false, feedbackTokens: [{ value: "old answer", state: "CORRECT" }], expectedText: "old answer", nextRecommendedMaskPercent: 50 };
function deferred() { let resolve!: (response: Response) => void; const promise = new Promise<Response>((done) => { resolve = done; }); return { promise, resolve }; }
function mount() { render(<DictationLessonClient lesson={lesson} initialProgress={null} isAuthenticated />); }
async function settle() { await act(async () => { await Promise.resolve(); }); }
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(prompt()))); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("shows prompt failures and permits retry", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response(null, false));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("Không thể tải bài");
  fireEvent.click(screen.getByRole("button", { name: "Tải lại câu nghe" }));
  expect(await screen.findByRole("textbox")).toBeInTheDocument();
});

it("times out a stalled prompt body and recovers through retry", async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) } as Response);
  mount(); await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(screen.getByRole("alert")).toHaveTextContent("quá nhiều thời gian");
  fireEvent.click(screen.getByRole("button", { name: "Tải lại câu nghe" })); await settle();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});

it("retains answers and unlocks grading after a network error", async () => {
  mount(); const input = await screen.findByRole("textbox");
  fireEvent.change(input, { target: { value: "hello" } });
  vi.mocked(fetch).mockRejectedValueOnce(new Error("Mất kết nối"));
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra tất cả ô" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Mất kết nối");
  expect(input).toHaveValue("hello");
  expect(screen.getByRole("button", { name: "Kiểm tra tất cả ô" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("times out grading without automatic retries and retains the answer", async () => {
  vi.useFakeTimers(); mount(); await settle();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
  vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra tất cả ô" }));
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(screen.getByRole("alert")).toHaveTextContent("quá nhiều thời gian");
  expect(screen.getByRole("textbox")).toHaveValue("hello");
  expect(screen.getByRole("button", { name: "Kiểm tra tất cả ô" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("ignores previous-segment feedback and auto-navigation while retaining its completion", async () => {
  vi.useFakeTimers(); mount(); await settle();
  fireEvent.click(screen.getByRole("button", { name: "Tự động tiếp: Tắt" }));
  const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra tất cả ô" }));
  vi.mocked(fetch).mockResolvedValueOnce(response(prompt("s3")));
  fireEvent.click(screen.getByRole("button", { name: /#3/ })); await settle();
  await act(async () => pending.resolve(response(result)));
  await act(async () => { await vi.advanceTimersByTimeAsync(900); });
  expect(screen.getByText("Đoạn 3/3")).toBeInTheDocument();
  expect(screen.queryByText(/old answer/)).not.toBeInTheDocument();
  expect(screen.getByText("1/3")).toBeInTheDocument();
});

it("ignores a previous-mask blank check", async () => {
  mount(); await screen.findByRole("textbox");
  const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByTitle("Kiểm tra ô này"));
  vi.mocked(fetch).mockResolvedValueOnce(response(prompt("s1", 50)));
  fireEvent.click(screen.getByRole("button", { name: "Che 50%" })); await settle();
  await act(async () => pending.resolve(response({ state: "CORRECT" })));
  expect(screen.getByRole("textbox")).not.toHaveClass("border-emerald-500");
});

it("keeps new-segment grading locked while an older request finishes", async () => {
  mount(); await screen.findByRole("textbox");
  const older = deferred(); vi.mocked(fetch).mockReturnValueOnce(older.promise);
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra tất cả ô" }));
  vi.mocked(fetch).mockResolvedValueOnce(response(prompt("s2")));
  fireEvent.click(screen.getByRole("button", { name: /#2/ })); await settle();
  const newer = deferred(); vi.mocked(fetch).mockReturnValueOnce(newer.promise);
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra tất cả ô" }));
  await act(async () => older.resolve(response(null, false)));
  expect(screen.getByRole("button", { name: "Đang chấm..." })).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await act(async () => newer.resolve(response(result)));
  expect(screen.getByRole("button", { name: "Kiểm tra tất cả ô" })).toBeEnabled();
});

it("cancels a scheduled automatic advance when mask changes", async () => {
  vi.useFakeTimers(); mount(); await settle();
  fireEvent.click(screen.getByRole("button", { name: "Tự động tiếp: Tắt" }));
  vi.mocked(fetch).mockResolvedValueOnce(response(result));
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra tất cả ô" })); await settle();
  vi.mocked(fetch).mockResolvedValueOnce(response(prompt("s1", 50)));
  fireEvent.click(screen.getByRole("button", { name: "Che 50%" })); await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(900); });
  expect(screen.getByText("Đoạn 1/3")).toBeInTheDocument();
});

it("surfaces a failed blank check without clearing its input", async () => {
  mount(); const input = await screen.findByRole("textbox");
  fireEvent.change(input, { target: { value: "hello" } });
  vi.mocked(fetch).mockResolvedValueOnce(response(null, false));
  fireEvent.click(screen.getByTitle("Kiểm tra ô này"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Không thể tải bài");
  expect(input).toHaveValue("hello");
  expect(screen.getByTitle("Kiểm tra ô này")).toBeEnabled();
});
