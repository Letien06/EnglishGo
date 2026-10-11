import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import VocabSetDetailClient from "./VocabSetDetailClient";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
const words = [
  { id: 1, word: "apple", meaning: "tao", mastered: false },
  { id: 2, word: "pear", meaning: "le", mastered: false },
];
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const mark = (word: string) => within(screen.getByText(word).closest("tr")!).getByTitle("Đánh dấu đã thuộc");
function ack(options?: RequestInit) {
  const { reviews } = JSON.parse(options!.body as string) as { reviews: { wordId: number }[] };
  return new Response(JSON.stringify({ success: true, data: { reviews: reviews.map(({ wordId }) => ({ wordId, newStatus: "MASTERED" })) } }));
}

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(async () => { cleanup(); await tick(15_000); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("updates mastery immediately and batches two clicks while the server is slow", async () => {
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn((_url: string, _options?: RequestInit) => new Promise<Response>((done) => { resolve = done; }));
  vi.stubGlobal("fetch", fetcher);
  render(<VocabSetDetailClient setId={1} words={words} isOwner={false} userUid="detail-batch" />);
  fireEvent.click(mark("apple"));
  fireEvent.click(mark("pear"));
  expect(screen.getAllByTitle("Đã thuộc")).toHaveLength(2);
  expect(screen.getByRole("status")).toHaveTextContent("2 từ đang chờ đồng bộ");
  expect(fetcher).not.toHaveBeenCalled();
  await tick(100);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/vocab/reviews/batch");
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).reviews).toEqual([{ wordId: 1, mastered: true }, { wordId: 2, mastered: true }]);
  await act(async () => resolve(ack(fetcher.mock.calls[0][1])));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getAllByTitle("Đã thuộc")).toHaveLength(2);
});

it("retains the optimistic result on failure and retries the same durable receipt", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("Offline"))
    .mockImplementation(async (_url: string, options?: RequestInit) => ack(options));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<VocabSetDetailClient setId={1} words={words} isOwner={false} userUid="detail-retry" />);
  fireEvent.click(mark("apple"));
  await tick(100);
  expect(screen.getByTitle("Đã thuộc")).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("chưa đồng bộ");
  view.unmount();
  render(<VocabSetDetailClient setId={1} words={words} isOwner={false} userUid="detail-retry" />);
  expect(screen.getByTitle("Đã thuộc")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Thử lưu lại" }));
  await tick(1);
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
