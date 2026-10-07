import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DauToeicPracticeItem } from "@/types/dautoeic";
import { usePracticeResume } from "./use-practice-resume";

const items = [{ id: "one", questions: [{ id: "q1" }, { id: "q2" }] }, { id: "two", questions: [{ id: "q3" }] }] as DauToeicPracticeItem[];
function useHarness(uid: string | null = "learner", testId?: string, pendingAnswers?: Record<string, string>) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const resume = usePracticeResume({ skill: "reading", uid, part: 7, level: 1, testId, items, setAnswers, setIndex, pendingAnswers });
  return { ...resume, answers, index, setAnswers, setIndex };
}
afterEach(() => vi.unstubAllGlobals());

describe("background practice history", () => {
  it("requests history by test ID and cancels the previous test's request", () => {
    const fetcher = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetcher);
    const view = renderHook(({ testId }) => useHarness("learner", testId), { initialProps: { testId: "test-one" } });
    expect(fetcher).toHaveBeenCalledWith("/api/reading/progress?part=7&testId=test-one", expect.anything());
    const first = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    view.rerender({ testId: "test-two" });
    expect(first.signal?.aborted).toBe(true);
    expect(fetcher).toHaveBeenLastCalledWith("/api/reading/progress?part=7&testId=test-two", expect.anything());
    view.unmount();
  });
  it("resumes after the last complete passage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { uid: "learner", answers: { q1: "a", q2: "B", unrelated: "D" } } }) }));
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.index).toBe(1));
    expect(result.current.answers).toEqual({ q1: "A", q2: "B" });
  });

  it("uses latest local pending answers over older history to resume without refetching", async () => {
    let resolve!: (response: unknown) => void;
    const fetcher = vi.fn(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetcher);
    const view = renderHook(({ pending }) => useHarness("learner", undefined, pending), { initialProps: { pending: { q1: "B" } as Record<string, string> } });
    view.rerender({ pending: { q1: "D", q2: "A" } });
    await act(async () => resolve({ ok: true, json: async () => ({ success: true, data: { uid: "learner", answers: { q1: "A" } } }) }));
    expect(view.result.current.answers).toEqual({ q1: "D", q2: "A" });
    expect(view.result.current.index).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never overwrites a new answer or moves a learner who already interacted", async () => {
    let resolve!: (response: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => { resolve = done; })));
    const { result } = renderHook(() => useHarness());
    act(() => { result.current.markInteraction(); result.current.setAnswers({ q1: "D" }); });
    await act(async () => resolve({ ok: true, json: async () => ({ success: true, data: { uid: "learner", answers: { q1: "A", q2: "B" } } }) }));
    expect(result.current.answers).toEqual({ q1: "D", q2: "B" });
    expect(result.current.index).toBe(0);
  });

  it("rejects another learner's response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { uid: "other", answers: { q1: "A", q2: "B" } } }) }));
    const { result } = renderHook(() => useHarness());
    await waitFor(() => expect(result.current.resumeStatus).toContain("Chưa tải được"));
    expect(result.current.answers).toEqual({});
  });

  it("does not request history for guests and aborts on unmount", () => {
    const fetcher = vi.fn(() => new Promise(() => undefined));
    vi.stubGlobal("fetch", fetcher);
    const guest = renderHook(() => useHarness(null));
    expect(fetcher).not.toHaveBeenCalled();
    guest.unmount();
    const learner = renderHook(() => useHarness());
    const options = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    learner.unmount();
    expect(options.signal?.aborted).toBe(true);
  });
});
