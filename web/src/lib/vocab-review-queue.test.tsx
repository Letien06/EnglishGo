import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVocabReviewQueue } from "./vocab-review-queue";

let sequence = 0;
const user = () => `queue-test-${sequence++}`;
const success = () => {
  const reviews = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body as string).reviews as { wordId: number; mastered?: boolean; quality?: number }[];
  return { ok: true, status: 200, json: async () => ({ success: true, data: { reviews: reviews.map((review) => ({ wordId: review.wordId, newStatus: review.mastered ? "MASTERED" : review.quality !== undefined && review.quality < 3 ? "LEARNING" : "REVIEWING" })) } }) } as unknown as Response;
};
const tick = (ms = 100) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const payload = (call: number) => JSON.parse(vi.mocked(fetch).mock.calls[call][1]?.body as string);

describe("vocabulary review queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(success())));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it("enqueues immediately while requests are unresolved and serializes batches", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const userId = user();
    const { result } = renderHook(() => useVocabReviewQueue(userId, true));
    act(() => result.current.enqueue({ wordId: 1, mastered: true }));
    expect(result.current.pendingCount).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    await tick();
    expect(result.current.isSaving).toBe(true);
    act(() => result.current.enqueue({ wordId: 2, quality: 4 }));
    await tick(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(success()); });
    expect(result.current.pendingReviews).toEqual([{ wordId: 2, quality: 4 }]);
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.pendingCount).toBe(0);
  });

  it("retries transient failures using the identical request id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 7, quality: 2 }));
    await tick();
    expect(result.current.error).toBeTruthy();
    expect(result.current.pendingCount).toBe(1);
    await tick(500);
    expect(payload(0)).toEqual(payload(1));
    expect(result.current.pendingCount).toBe(0);
  });

  it("hydrates durable pending work and preserves an interrupted batch id", async () => {
    const uid = user();
    const entry = { token: "saved-token", review: { wordId: 3, mastered: true } };
    localStorage.setItem(`englishgo:vocab-review-queue:${uid}`, JSON.stringify({ pending: [entry], batch: { requestId: "saved-request", entries: [entry] } }));
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    expect(result.current.pendingCount).toBe(1);
    await tick();
    expect(payload(0).requestId).toBe("saved-request");
    expect(result.current.pendingCount).toBe(0);
  });

  it("clears only the confirmed version of each word", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 4, quality: 1 }));
    await tick();
    act(() => result.current.enqueue({ wordId: 4, mastered: true }));
    await act(async () => { resolve(success()); });
    expect(result.current.pendingReviews).toEqual([{ wordId: 4, mastered: true }]);
    await tick();
    expect(payload(1).reviews).toEqual([{ wordId: 4, mastered: true }]);
  });

  it("keeps in-flight work across unmount and resumes unsent work on remount", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const uid = user();
    const first = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => first.result.current.enqueue({ wordId: 8, quality: 4 }));
    await tick();
    act(() => first.result.current.enqueue({ wordId: 9, quality: 4 }));
    first.unmount();
    await act(async () => { resolve(success()); });
    await tick(10000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const second = renderHook(() => useVocabReviewQueue(uid, true));
    expect(second.result.current.pendingReviews).toEqual([{ wordId: 9, quality: 4 }]);
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(second.result.current.pendingCount).toBe(0);
  });

  it("caps batches at 100 and coalesces latest reviews per word", async () => {
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => {
      for (let wordId = 1; wordId <= 105; wordId++) result.current.enqueue({ wordId, quality: 1 });
      result.current.enqueue({ wordId: 1, mastered: true });
    });
    await tick();
    expect(payload(0).reviews).toHaveLength(100);
    expect(payload(0).reviews[0]).toEqual({ wordId: 1, mastered: true });
    await tick();
    expect(payload(1).reviews).toHaveLength(5);
    expect(result.current.pendingCount).toBe(0);
  });

  it("stops future retries on disable and never syncs another account's work", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    const uid = user();
    const hook = renderHook(({ enabled }) => useVocabReviewQueue(uid, enabled), { initialProps: { enabled: true } });
    act(() => hook.result.current.enqueue({ wordId: 10, quality: 4 }));
    await tick();
    hook.rerender({ enabled: false });
    const otherUid = user();
    const other = renderHook(() => useVocabReviewQueue(otherUid, true));
    act(() => other.result.current.enqueue({ wordId: 11, quality: 4 }));
    await tick(10000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(payload(1).reviews).toEqual([{ wordId: 11, quality: 4 }]);
    expect(hook.result.current.pendingCount).toBe(0);
  });

  it("retains memory work and shows storage failures", async () => {
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    act(() => result.current.enqueue({ wordId: 12, quality: 4 }));
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.error).toMatch(/thiết bị/);
    await tick();
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.error).toBeTruthy();
  });

  it("keeps acknowledged mastery across unmount until fresh server data agrees", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { reviews: [{ wordId: 13, newStatus: "MASTERED" }] } }) } as Response);
    const uid = user();
    const first = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => first.result.current.enqueue({ wordId: 13, quality: 4 }));
    expect(first.result.current.masteryByWordId.has(13)).toBe(false);
    await tick();
    expect(first.result.current.pendingCount).toBe(0);
    expect(first.result.current.masteryByWordId.get(13)).toBe(true);
    first.unmount();
    const second = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => second.result.current.reconcile([{ id: 13, mastered: false }]));
    expect(second.result.current.masteryByWordId.get(13)).toBe(true);
    act(() => second.result.current.reconcile([{ id: 13, mastered: true }]));
    expect(second.result.current.masteryByWordId.has(13)).toBe(false);
  });

  it("layers newer pending mastery over an older acknowledged operation", async () => {
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 14, mastered: true }));
    expect(result.current.masteryByWordId.get(14)).toBe(true);
    await tick();
    act(() => result.current.enqueue({ wordId: 14, quality: 1 }));
    await act(async () => { resolve({ ...success(), json: async () => ({ success: true, data: { reviews: [{ wordId: 14, newStatus: "MASTERED" }] } }) } as Response); });
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.masteryByWordId.get(14)).toBe(false);
    await tick();
    expect(result.current.masteryByWordId.get(14)).toBe(false);
  });

  it("flushes navigation work without waiting for the coalescing timer", async () => {
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 15, quality: 4 }));
    let flushed = false;
    await act(async () => { flushed = await result.current.flush(); });
    expect(flushed).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.current.pendingCount).toBe(0);
  });

  it("retains unauthorized work without automatic online retry until reenabled", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401 } as Response);
    const uid = user();
    const hook = renderHook(({ enabled }) => useVocabReviewQueue(uid, enabled), { initialProps: { enabled: true } });
    act(() => hook.result.current.enqueue({ wordId: 16, quality: 4 }));
    await tick();
    act(() => window.dispatchEvent(new Event("online")));
    await tick(30000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(hook.result.current.pendingCount).toBe(1);
    hook.rerender({ enabled: false });
    hook.rerender({ enabled: true });
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(payload(0).requestId).toBe(payload(1).requestId);
  });

  it("retries a nontransient failure only after manual action", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400 } as Response);
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 17, quality: 4 }));
    await tick(30000);
    expect(fetch).toHaveBeenCalledOnce();
    act(() => result.current.retry());
    await tick(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(payload(0)).toEqual(payload(1));
  });

  it("bounds automatic retries and resumes retained work when back online", async () => {
    for (let attempt = 0; attempt < 6; attempt++) vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Offline"));
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 18, quality: 4 }));
    await tick(60000);
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(result.current.pendingCount).toBe(1);
    await tick(60000);
    expect(fetch).toHaveBeenCalledTimes(6);
    act(() => window.dispatchEvent(new Event("online")));
    await tick(1);
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(payload(0)).toEqual(payload(6));
    expect(result.current.pendingCount).toBe(0);
  });

  it.each([
    { success: true },
    { success: true, data: { reviews: [] } },
    { success: true, data: { reviews: [{ wordId: 19, newStatus: "MASTERED" }] } },
    { success: true, data: { reviews: [{ wordId: 19, newStatus: "MASTERED" }, { wordId: 19, newStatus: "MASTERED" }] } },
    { success: true, data: { reviews: [{ wordId: 19, newStatus: "MASTERED" }, { wordId: 21, newStatus: "MASTERED" }] } },
    { success: true, data: { reviews: [{ wordId: 19, newStatus: "MASTERED" }, { wordId: 20, newStatus: "UNKNOWN" }] } },
  ])("retains every operation after a malformed successful response: %j", async (envelope) => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: async () => envelope } as Response);
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => {
      result.current.enqueue({ wordId: 19, mastered: true });
      result.current.enqueue({ wordId: 20, mastered: true });
    });
    await tick();
    expect(result.current.pendingCount).toBe(2);
    expect(result.current.error).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(`englishgo:vocab-review-queue:${uid}`)!).pending).toHaveLength(2);
    await tick(500);
    expect(payload(1)).toEqual(payload(0));
    expect(result.current.pendingCount).toBe(0);
  });

  it("bounds a hanging fetch and navigation flush, then retries the same batch", async () => {
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 22, quality: 4 }));
    let flush!: Promise<boolean>;
    act(() => { flush = result.current.flush(); });
    expect(result.current.isSaving).toBe(true);
    await tick(15000);
    expect(await flush).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.pendingCount).toBe(1);
    expect((vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
    await tick(500);
    expect(payload(1)).toEqual(payload(0));
    expect(result.current.pendingCount).toBe(0);
  });

  it("also times out a hanging response body without losing pending work", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200, json: () => new Promise(() => {}) } as Response);
    const uid = user();
    const { result } = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => result.current.enqueue({ wordId: 23, quality: 4 }));
    await tick(15100);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.error).toBeTruthy();
    await tick(500);
    expect(payload(1)).toEqual(payload(0));
    expect(result.current.pendingCount).toBe(0);
  });

  it("keeps one online listener until the last same-user subscriber unmounts", async () => {
    for (let attempt = 0; attempt < 6; attempt++) vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Offline"));
    const uid = user();
    const first = renderHook(() => useVocabReviewQueue(uid, true));
    const second = renderHook(() => useVocabReviewQueue(uid, true));
    act(() => first.result.current.enqueue({ wordId: 24, quality: 4 }));
    await tick(60000);
    first.unmount();
    act(() => window.dispatchEvent(new Event("online")));
    await tick(1);
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(second.result.current.pendingCount).toBe(0);
  });
});
