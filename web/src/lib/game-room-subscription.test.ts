import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), db: vi.fn() }));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), collection: vi.fn(), onSnapshot: mocks.snapshot }));
vi.mock("./firebase/client", () => ({ getClientDb: mocks.db }));
import { subscribeGameRoom } from "./game-room-subscription";

let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("room subscription read budget", () => {
  it("uses only two listeners and never polls while both are healthy", async () => {
    const unsub = vi.fn();
    mocks.snapshot.mockImplementation((_ref, callback) => {
      callback({ exists: () => true, data: () => ({ status: "playing" }), docs: [] });
      return unsub;
    });
    const room = vi.fn();
    stop = subscribeGameRoom("ABC123", { room, players: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(room).toHaveBeenCalledWith({ status: "playing" });
    expect(mocks.snapshot).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
    stop();
    expect(unsub).toHaveBeenCalledTimes(2);
    stop = undefined;
  });
  it("detaches both listeners before fallback, respects quota cooldown and stops on unmount", async () => {
    const failures: (() => void)[] = [];
    const unsub = vi.fn();
    mocks.snapshot.mockImplementation((_ref, _callback, error) => { failures.push(error); return unsub; });
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 503, headers: { "Retry-After": "60" } }));
    stop = subscribeGameRoom("ABC123", { room: vi.fn(), players: vi.fn() });
    failures[0]();
    expect(unsub).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    stop(); stop = undefined;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("never overlaps fallback requests", async () => {
    mocks.db.mockImplementation(() => { throw new Error("missing config"); });
    let resolve!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((done) => { resolve = done; }));
    stop = subscribeGameRoom("ABC123", { room: vi.fn(), players: vi.fn() });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({ success: true, data: {} })));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("pauses listeners in hidden tabs and resumes one transport when visible", async () => {
    const unsub = vi.fn();
    mocks.snapshot.mockReturnValue(unsub);
    stop = subscribeGameRoom("ABC123", { room: vi.fn(), players: vi.fn() });
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(unsub).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.snapshot).toHaveBeenCalledTimes(4);
  });
});
