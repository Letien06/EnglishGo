import React, { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVocabReviewQueue } from "@/lib/vocab-review-queue";
import type { VocabularyRoundResult } from "@/lib/vocab-arcade";
import ContextLearning from "./ContextLearning";

vi.mock("../useVocabularyAudio", () => ({ default: () => ({ speak: vi.fn(), speakWord: vi.fn(), stop: vi.fn() }) }));

const uid = "context-real-queue-integration";
const words = [
  { id: 1, word: "apple", meaning: "táo", mastered: false },
  { id: 2, word: "banana", meaning: "chuối", mastered: false },
  { id: 3, word: "cherry", meaning: "anh đào", mastered: false },
];
function RootOverlay({ onComplete }: { onComplete: (result: VocabularyRoundResult) => void }) {
  const queue = useVocabReviewQueue(uid, true);
  const { reconcile } = queue;
  useEffect(() => { reconcile(words); }, [reconcile]);
  const overlaid = words.map((word) => ({ ...word, mastered: queue.masteryByWordId.get(word.id) ?? word.mastered }));
  return <ContextLearning words={overlaid} currentUserId={uid} isAuthenticated onComplete={onComplete} onExit={vi.fn()} />;
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("React", React); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

it("advances immediately through root queue publications and ACKs without skipping or resurrecting stale words", async () => {
  const saves: Array<{ resolve: (response: Response) => void; ids: number[] }> = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => new Promise<Response>((resolve) => {
    const payload = JSON.parse(options.body as string) as { reviews: Array<{ wordId: number }> };
    saves.push({ resolve, ids: payload.reviews.map((review) => review.wordId) });
  })));
  const onComplete = vi.fn();
  const view = render(<RootOverlay onComplete={onComplete} />);
  const card = () => screen.getByRole("button", { name: "Lật thẻ học" });
  expect(card()).toHaveTextContent("apple");
  fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
  fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
  expect(card()).toHaveTextContent("banana");
  expect(onComplete).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(saves).toHaveLength(1);
  expect(saves[0].ids).toEqual([1]);
  fireEvent.click(screen.getByTitle("Đánh dấu đã thuộc"));
  fireEvent.click(screen.getByRole("button", { name: "Tốt" }));
  expect(card()).toHaveTextContent("cherry");
  expect(onComplete).not.toHaveBeenCalled();
  const acknowledge = async (index: number) => {
    await act(async () => {
      saves[index].resolve(new Response(JSON.stringify({ success: true, data: { reviews: saves[index].ids.map((wordId) => ({ wordId, newStatus: "MASTERED" })) } }), { status: 200 }));
    });
  };
  await acknowledge(0);
  expect(card()).toHaveTextContent("cherry");
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(saves).toHaveLength(2);
  expect(saves[1].ids).toEqual([2]);
  await acknowledge(1);
  expect(card()).toHaveTextContent("cherry");
  expect(onComplete).not.toHaveBeenCalled();
  view.unmount();
  render(<RootOverlay onComplete={onComplete} />);
  expect(card()).toHaveTextContent("cherry");
  expect(screen.getByRole("button", { name: "Chưa thuộc (1)" })).toBeInTheDocument();
});
