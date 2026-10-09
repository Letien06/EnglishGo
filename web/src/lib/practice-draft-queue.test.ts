import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeDraftQueue } from "./practice-draft-queue";
import { readPracticeDraft } from "./practice-draft-storage";

const config = { uid: "alice", sessionKey: "test", testId: 1, mode: "part", parts: [5], durationMinutes: 18, startedAtMillis: 10 };
const stops: (() => void)[] = [];
const success = () => new Response(JSON.stringify({ success: true }));
function queue(overrides = {}) { const value = new PracticeDraftQueue({ ...config, ...overrides }); stops.push(value.activate()); return value; }
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(1000); vi.spyOn(navigator, "onLine", "get").mockReturnValue(true); });
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("durable exam draft synchronization", () => {
  it("coalesces changes durably while offline and restores on reload without mixing accounts", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetcher = vi.fn().mockResolvedValue(success()); vi.stubGlobal("fetch", fetcher);
    const first = queue();
    first.enqueue('{"answers":{"1":"A"}}', 0);
    first.enqueue('{"answers":{"1":"B"}}', 1);
    expect(first.getSnapshot().pendingCount).toBe(1);
    stops.pop()!();
    const other = queue({ uid: "bob" });
    expect(other.getSnapshot().pendingCount).toBe(0);
    const restored = queue();
    expect(restored.getSnapshot().pendingCount).toBe(1);
    expect(JSON.parse(readPracticeDraft("alice", "test", "{}", 10)).answers).toEqual({ 1: "B" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ expectedUid: "alice", runStartedAtMillis: 10, currentQuestionIndex: 1 });
    expect(restored.getSnapshot().pendingCount).toBe(0);
  });
  it("keeps the same request ID through a 503 retry and only acknowledges success", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: "busy" }), { status: 503 })).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetcher);
    const q = queue(); q.enqueue('{"answers":{}}', 0);
    expect(await q.flush()).toBe(false);
    expect(q.getSnapshot()).toMatchObject({ pendingCount: 1, error: "busy" });
    await vi.advanceTimersByTimeAsync(1999); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
    expect(q.getSnapshot()).toMatchObject({ pendingCount: 0, error: null });
  });
  it("serializes writes and does not acknowledge edits made while a request is in flight", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn().mockReturnValueOnce(new Promise<Response>(done => { resolve = done; })).mockImplementation(() => Promise.resolve(success()));
    vi.stubGlobal("fetch", fetcher);
    const q = queue(); q.enqueue('{"answers":{"1":"A"}}', 0);
    const pending = q.flush();
    q.enqueue('{"answers":{"1":"B"}}', 0);
    await vi.advanceTimersByTimeAsync(1500); expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(success()); await pending;
    expect(q.getSnapshot().pendingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(JSON.parse(fetcher.mock.calls[1][1].body).payload).answers).toEqual({ 1: "B" });
  });
  it("stops automatic retry after an account/run conflict and retains the unsaved copy", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: false, error: "account changed" }), { status: 403 })));
    vi.stubGlobal("fetch", fetcher);
    const q = queue(); q.enqueue('{"answers":{}}', 0); await q.flush();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(q.getSnapshot().pendingCount).toBe(1);
    expect(queue({ startedAtMillis: 20 }).getSnapshot().pendingCount).toBe(0);
  });
  it("settles in-flight work before completion and removes only this run's local data", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
    const q = queue(); q.enqueue('{"answers":{}}', 0); const pending = q.flush();
    const paused = q.pause();
    resolve(success()); await pending; await paused;
    q.complete();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(q.getSnapshot().pendingCount).toBe(0);
  });
});
