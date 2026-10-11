import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateLearningLevels, setActiveLearnerId } from "@/lib/client-learning-progress-cache";
import useListeningPartProgress from "./useListeningPartProgress";

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("background listening tab progress", () => {
  it("loads remaining parts with a maximum of two requests at once", async () => {
    setActiveLearnerId("parallel-overview");
    let inFlight = 0;
    let peak = 0;
    const resolvePending: Array<() => void> = [];
    const fetcher = vi.fn((url: string) => new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      resolvePending.push(() => {
        inFlight -= 1;
        resolve({ ok: true, json: async () => ({ success: true, data: { uid: "parallel-overview", tests: [{ part: Number(url.at(-1)), questionCount: 10, done: 2, correct: 2, wrong: 0 }] } }) });
      });
    }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useListeningPartProgress(1, true));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(peak).toBe(2);
    act(() => { resolvePending.splice(0, 1).forEach((resolve) => resolve()); });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    act(() => { resolvePending.splice(0).forEach((resolve) => resolve()); });
    await waitFor(() => expect(result.current[4]).toMatchObject({ total: 10, done: 2 }));
    expect(peak).toBe(2);
  });

  it("keeps previous totals visible while refreshing a changed Part, including on failure", async () => {
    setActiveLearnerId("stale-overview");
    const fetcher = vi.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () => ({ success: true, data: { uid: "stale-overview", tests: [{ part: Number(url.at(-1)), questionCount: 20, done: 8, correct: 6, wrong: 2 }] } }) }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useListeningPartProgress(1, true));
    await waitFor(() => expect(result.current[4]).toMatchObject({ done: 8 }));
    let rejectRefresh!: (error: Error) => void;
    fetcher.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }));
    act(() => invalidateLearningLevels("listening", [2]));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(result.current[2]).toMatchObject({ done: 8, total: 20 });
    await act(async () => rejectRefresh(new Error("Offline")));
    expect(result.current[2]).toMatchObject({ done: 8, total: 20 });
  });

  it("cancels both workers on unmount and never starts the remaining Part", async () => {
    setActiveLearnerId("cancel-overview");
    const pending: Array<() => void> = [];
    const fetcher = vi.fn((_url: string, _options?: RequestInit) => new Promise((resolve) => {
      pending.push(() => resolve({ ok: false, json: async () => ({ success: false }) }));
    }));
    vi.stubGlobal("fetch", fetcher);
    const { unmount } = renderHook(() => useListeningPartProgress(1, true));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    unmount();
    expect(fetcher.mock.calls.every(([, options]) => options?.signal?.aborted)).toBe(true);
    await act(async () => pending.forEach((resolve) => resolve()));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses only Reading endpoints for the Reading tab overview", async () => {
    setActiveLearnerId("reading-overview");
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => ({ success: true, data: { uid: "reading-overview", tests: [{ part: Number(url.at(-1)), questionCount: 16, done: 4, correct: 3, wrong: 1 }] } }) }));
    vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useListeningPartProgress(5, true, "reading"));
    await waitFor(() => expect(result.current[7]).toMatchObject({ done: 4, total: 16 }));
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/reading/tests?part=6", "/api/reading/tests?part=7"]);
  });
  it("does not fetch before the selected part is ready", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderHook(() => useListeningPartProgress(1, false));
    await act(async () => undefined);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("loads only the other parts, reuses summaries and isolates accounts", async () => {
    setActiveLearnerId("part-overview-user");
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => ({ success: true, data: { uid: "part-overview-user", tests: [{ part: Number(url.at(-1)), questionCount: 120, done: 12, correct: 10, wrong: 2 }] } }) }));
    vi.stubGlobal("fetch", fetcher);
    const { result, rerender } = renderHook(({ part }) => useListeningPartProgress(part, true), { initialProps: { part: 1 } });
    await waitFor(() => expect(result.current[4]).toMatchObject({ done: 12, total: 120 }));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).not.toHaveBeenCalledWith("/api/listening/tests?part=1", expect.anything());
    rerender({ part: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(result.current[3]).toMatchObject({ done: 12, total: 120 });
    act(() => setActiveLearnerId("another-overview-user"));
    await waitFor(() => expect(result.current).toEqual({}));
  });
});
