import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FlashcardGame from "./FlashcardGame";

const queue = vi.hoisted(() => ({ enqueue: vi.fn(), pendingReviews: [] as { wordId: number; mastered?: true }[], masteryByWordId: new Map<number, boolean>(), pendingCount: 0, error: null as string | null, retry: vi.fn(), isSaving: false, reconcile: vi.fn(), flush: vi.fn().mockResolvedValue(true) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/vocab-review-queue", () => ({ useVocabReviewQueue: () => queue }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./useVocabularyAudio", () => ({ default: () => ({ speak: vi.fn(), speakWord: vi.fn(), stop: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn());
  queue.enqueue.mockReset();
  queue.retry.mockReset();
  queue.error = null;
  queue.pendingReviews = [];
  queue.pendingCount = 0;
  queue.flush.mockReset().mockResolvedValue(true);
  router.push.mockReset();
  router.replace.mockReset();
  window.history.replaceState({ __NA: true }, "", "/vocab/42/flashcards?mode=menu&tab=learn");
  queue.masteryByWordId = new Map();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it("keeps the next learning card usable while root reports a background save error and retry", async () => {
  const session = { set: { id: 42, title: "Test", topic: "Words" }, words: [
    { id: 1, word: "apple", meaning: "táo", mastered: false },
    { id: 2, word: "banana", meaning: "chuối", mastered: false },
  ] };
  const props = { session, initialMode: "menu", initialTab: "learn" as const, practiceOptions: [], reviewMode: false, isAuthenticated: true, currentUserId: "user-1", loginHref: "/login" };
  const { rerender } = render(<FlashcardGame {...props} />);
  fireEvent.click(await screen.findByTitle("Đánh dấu đã thuộc"));
  fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
  expect(queue.enqueue).toHaveBeenCalledWith({ wordId: 1, quality: 4 });
  expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
  queue.error = "Chưa lưu được tiến độ. Sẽ tự thử lại.";
  queue.pendingCount = 1;
  queue.masteryByWordId = new Map([[1, true]]);
  rerender(<FlashcardGame {...props} />);
  expect(screen.getByRole("alert")).toHaveTextContent(queue.error);
  fireEvent.click(screen.getByRole("button", { name: "Thử lưu lại" }));
  expect(queue.retry).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
  expect(queue.enqueue).toHaveBeenCalledOnce();
});

const studyProps = {
  session: { set: { id: 42, title: "Test", topic: "Words" }, words: [
    { id: 1, word: "apple", meaning: "táo", mastered: false },
    { id: 2, word: "banana", meaning: "chuối", mastered: false },
  ] },
  initialMode: "menu", initialTab: "learn" as const, practiceOptions: [],
  reviewMode: false, isAuthenticated: true, currentUserId: "user-1", loginHref: "/login",
};
async function learn() {
  fireEvent.click(await screen.findByTitle("Đánh dấu đã thuộc"));
  fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
}
const exit = () => fireEvent.click(screen.getByTitle("Thoát phiên học"));

it("prompts on browser Back even after automatic saving and can cancel repeatedly", async () => {
  render(<FlashcardGame {...studyProps} />);
  await learn();
  await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(screen.getByRole("dialog", { name: "Lưu tiến trình học?" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục học" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lật thẻ học" })).toHaveTextContent("banana");
  await act(async () => { window.history.back(); await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(router.replace).not.toHaveBeenCalled();
});

it("waits for the save acknowledgement before returning to the Test page", async () => {
  let resolve!: (saved: boolean) => void;
  queue.flush.mockImplementationOnce(() => new Promise<boolean>((done) => { resolve = done; }));
  const props = { ...studyProps, session: { ...studyProps.session, set: { ...studyProps.session.set, externalTestId: "test-1" } } };
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, data: { parts: [] } })));
  render(<FlashcardGame {...props} />);
  await learn();
  exit();
  fireEvent.click(screen.getByRole("button", { name: "Lưu tiến trình" }));
  expect(queue.flush).toHaveBeenCalledOnce();
  expect(router.replace).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Đang lưu..." })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => resolve(true));
  await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
  expect(router.replace.mock.calls[0][0]).toMatch(/^\/vocab\/dautoeic\/test-1\?studyReturn=.+&saved=1$/);
});

it("keeps the dialog open on failure and retries before navigating", async () => {
  queue.flush.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<FlashcardGame {...studyProps} />);
  await learn();
  exit();
  fireEvent.click(screen.getByRole("button", { name: "Lưu tiến trình" }));
  await screen.findByText(/Chưa lưu được tiến trình/);
  expect(router.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Lưu tiến trình" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
  expect(queue.flush).toHaveBeenCalledTimes(2);
});

it("leaves without waiting while retaining pending reviews", async () => {
  queue.pendingReviews = [{ wordId: 1, mastered: true }];
  queue.pendingCount = 1;
  render(<FlashcardGame {...studyProps} />);
  await screen.findByTitle("Thoát phiên học");
  exit();
  fireEvent.click(screen.getByRole("button", { name: "Không chờ lưu" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
  expect(queue.flush).not.toHaveBeenCalled();
  expect(queue.pendingReviews).toEqual([{ wordId: 1, mastered: true }]);
});

it("exits a fresh session without showing a save dialog", async () => {
  render(<FlashcardGame {...studyProps} />);
  await screen.findByTitle("Thoát phiên học");
  exit();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(router.push).toHaveBeenCalledWith("/vocab/42");
});

it("suspends study shortcuts while confirming departure", async () => {
  render(<FlashcardGame {...studyProps} />);
  await learn();
  fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
  exit();
  fireEvent.keyDown(window, { key: "3" });
  expect(queue.enqueue).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục học" }));
  fireEvent.keyDown(window, { key: "3" });
  expect(queue.enqueue).toHaveBeenCalledTimes(2);
});
