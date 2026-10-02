import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveLearnerId } from "@/lib/client-learning-progress-cache";
import useListeningPartProgress from "./useListeningPartProgress";

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("background listening tab progress", () => {
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
