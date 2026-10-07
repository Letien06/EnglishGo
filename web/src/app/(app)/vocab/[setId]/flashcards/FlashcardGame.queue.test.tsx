import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FlashcardGame from "./FlashcardGame";

const queue = vi.hoisted(() => ({ enqueue: vi.fn(), pendingReviews: [], masteryByWordId: new Map<number, boolean>(), pendingCount: 0, error: null as string | null, retry: vi.fn(), isSaving: false, reconcile: vi.fn(), flush: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/vocab-review-queue", () => ({ useVocabReviewQueue: () => queue }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./useVocabularyAudio", () => ({ default: () => ({ speak: vi.fn(), speakWord: vi.fn(), stop: vi.fn() }) }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn());
  queue.enqueue.mockReset();
  queue.retry.mockReset();
  queue.error = null;
  queue.masteryByWordId = new Map();
});
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("keeps the next learning card usable while root reports a background save error and retry", async () => {
  const session = { set: { id: 42, title: "Test", topic: "Words" }, words: [
    { id: 1, word: "apple", meaning: "táo", mastered: false },
    { id: 2, word: "banana", meaning: "chuối", mastered: false },
  ] };
  const props = { session, initialMode: "menu", initialTab: "learn" as const, practiceOptions: [], reviewMode: false, isAuthenticated: true, currentUserId: "user-1", loginHref: "/login" };
  const { rerender } = render(<FlashcardGame {...props} />);
  fireEvent.click(await screen.findByTitle("Đánh dấu đã thuộc"));
  expect(queue.enqueue).toHaveBeenCalledWith({ wordId: 1, mastered: true });
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
