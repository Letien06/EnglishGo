import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceRacePlayer, createRacePlayer, type RaceEvent, type RacePlayer, type RaceRoom } from "@/lib/vocab-race";
import { useVocabRace } from "./useVocabRace";

type Handlers = { room: (value: RaceRoom) => void; players: (value: RacePlayer[]) => void };
const subscription = vi.hoisted(() => ({ handlers: null as Handlers | null, stop: vi.fn() }));
vi.mock("@/lib/game-room-subscription", () => ({ subscribeGameRoom: (_code: string, handlers: Handlers) => { subscription.handlers = handlers; return subscription.stop; } }));
const start = Date.parse("2026-10-08T09:00:00Z");
const words = [
  { id: 1, word: "apple", meaning: "quả táo", mastered: false },
  { id: 2, word: "banana", meaning: "quả chuối", mastered: false },
  { id: 3, word: "orange", meaning: "quả cam", mastered: false },
  { id: 4, word: "grape", meaning: "quả nho", mastered: false },
];
const room: RaceRoom = { code: "RACE22", hostId: "me", gameMode: "blast", status: "playing", words, runId: "run-1", raceVersion: 1, countdownEndsAt: start, matchEndsAt: start + 120000, questionDurationMs: 5000, serverNow: start, updatedAt: start };
const me = () => createRacePlayer({ uid: "me", displayName: "Bạn" }, room);
const opponent = () => createRacePlayer({ uid: "other", displayName: "Đối thủ" }, room);
function response(data: unknown, status = 200) { return new Response(JSON.stringify({ success: status < 400, data }), { status }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let serverPlayer: RacePlayer;
let getRoom: RaceRoom;
let identity: string;
let answer: (events: RaceEvent[]) => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;
function acknowledge(events: RaceEvent[], status: RaceRoom["status"] = "playing") {
  for (const event of events) serverPlayer = advanceRacePlayer(serverPlayer, event, words, "blast", 5000);
  return response({ runId: room.runId, player: serverPlayer, status });
}
function posts() { return fetchMock.mock.calls.filter(([url]) => String(url) === "/api/vocab/game-room/answer"); }
function events(index: number) { return (JSON.parse(posts()[index][1]!.body as string) as { events: RaceEvent[] }).events; }
async function tick(milliseconds = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); }
function mount(initialPlayer = me(), initialRoom = room, onReturnToLobby?: () => void) {
  return renderHook(() => useVocabRace({ roomCode: room.code, initialRoom, initialPlayers: [initialPlayer, opponent()], currentUserId: "me", onReturnToLobby }));
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(start); vi.clearAllMocks(); sessionStorage.clear();
  serverPlayer = me(); getRoom = room; identity = "me";
  answer = async (batch) => acknowledge(batch);
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/vocab/game-room/answer") return answer(JSON.parse(init!.body as string).events);
    if (url.startsWith("/api/vocab/game-room?")) return response({ room: { ...getRoom, serverNow: Date.now() }, players: [serverPlayer, opponent()], currentUserId: identity, serverNow: Date.now() });
    return response({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("independent race delivery and reconciliation", () => {
  it("automatically recovers clock bootstrap after an initial network failure", async () => {
    const healthyFetch = fetchMock.getMockImplementation()!;
    let failed = false;
    fetchMock.mockImplementation((input, init) => {
      if (String(input).startsWith("/api/vocab/game-room?") && !failed) { failed = true; return Promise.reject(new TypeError("Clock lookup offline")); }
      return healthyFetch(input, init);
    });
    const withoutClock = { ...room }; delete withoutClock.serverNow;
    const { result } = mount(me(), withoutClock); await tick();
    expect(result.current.isClockReady).toBe(false);
    expect(result.current.isCountdown).toBe(true);
    expect(result.current.clockError).toBeTruthy();
    await tick(5000);
    expect(result.current.isClockReady).toBe(true);
    expect(result.current.clockError).toBe("");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/vocab/game-room?")).length).toBeGreaterThan(1);
  });

  it("stops exhausted clock retries and permits explicit manual recovery", async () => {
    const healthyFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Offline")));
    const withoutClock = { ...room }; delete withoutClock.serverNow;
    const { result } = mount(me(), withoutClock); await tick(30000);
    const attempts = fetchMock.mock.calls.length;
    expect(attempts).toBe(5);
    expect(result.current.isClockReady).toBe(false);
    expect(result.current.clockError).toBeTruthy();
    await tick(5000);
    expect(fetchMock).toHaveBeenCalledTimes(attempts);
    fetchMock.mockImplementation(healthyFetch);
    act(() => result.current.retrySync()); await tick();
    expect(fetchMock).toHaveBeenCalledTimes(attempts + 1);
    expect(result.current.isClockReady).toBe(true);
    expect(result.current.clockError).toBe("");
  });

  it("cancels scheduled clock retries when the arena unmounts", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Offline")));
    const withoutClock = { ...room }; delete withoutClock.serverNow;
    const view = mount(me(), withoutClock); await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    await tick(30000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(subscription.stop).toHaveBeenCalledTimes(1);
  });

  it("gates input until server time is known even when the device clock is seven hours ahead", async () => {
    vi.setSystemTime(start + 7 * 60 * 60 * 1000);
    const lookup = deferred<Response>();
    fetchMock.mockImplementation((input, init) => String(input).startsWith("/api/vocab/game-room?") ? lookup.promise : answer(JSON.parse(init!.body as string).events));
    const withoutClock = { ...room }; delete withoutClock.serverNow;
    const { result } = mount(me(), withoutClock); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    expect(result.current.isCountdown).toBe(true);
    expect(result.current.pendingCount).toBe(0); expect(posts()).toHaveLength(0);
    await act(async () => { lookup.resolve(response({ room, players: [me(), opponent()], currentUserId: "me", serverNow: start })); });
    expect(result.current.now).toBe(start);
    expect(result.current.isCountdown).toBe(false);
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    expect(result.current.player.currentIndex).toBe(1);
    expect(result.current.pendingCount).toBe(1);
  });

  it("predicts the next question immediately and serializes later events behind a deferred request", async () => {
    const first = deferred<Response>(); answer = () => first.promise;
    const { result } = mount(); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    expect(result.current.player.currentIndex).toBe(1);
    expect(result.current.pendingCount).toBe(1);
    await tick(250);
    expect(posts()).toHaveLength(1);
    act(() => result.current.submit({ type: "answer", questionIndex: 1, selected: "banana" }));
    expect(result.current.player.currentIndex).toBe(2);
    await tick(300);
    expect(posts()).toHaveLength(1);
    answer = async (batch) => acknowledge(batch);
    await act(async () => { first.resolve(acknowledge(events(0))); });
    await tick(699);
    expect(posts()).toHaveLength(1);
    await tick(1);
    expect(posts()).toHaveLength(2);
    expect(events(1).map((event) => event.seq)).toEqual([2]);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.player.correctCount).toBe(2);
  });

  it("retries identical events after a lost acknowledgement without double scoring", async () => {
    let lost = true;
    answer = async (batch) => {
      const ack = acknowledge(batch);
      if (lost) { lost = false; throw new TypeError("Response lost"); }
      return ack;
    };
    const { result } = mount(); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    await tick(250);
    expect(serverPlayer.score).toBe(10);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.syncError).toBeTruthy();
    await tick(1000);
    expect(events(1)).toEqual(events(0));
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.player.score).toBe(10);
    expect(serverPlayer.correctCount).toBe(1);
  });

  it("batches independently played questions in immutable sequence order", async () => {
    const { result } = mount(); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    await tick(200);
    act(() => result.current.submit({ type: "answer", questionIndex: 1, selected: "banana" }));
    await tick(50);
    expect(posts()).toHaveLength(1);
    expect(events(0).map((event) => [event.seq, event.questionIndex, event.selected])).toEqual([[1, 0, "apple"], [2, 1, "banana"]]);
    expect(result.current.pendingCount).toBe(0);
    expect(serverPlayer.correctCount).toBe(2);
  });

  it("rebases pending answers over stale own SSE without rolling back local progression", async () => {
    const request = deferred<Response>(); answer = () => request.promise;
    const { result } = mount(); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    await tick(250);
    act(() => subscription.handlers!.players([me(), { ...opponent(), score: 90, currentIndex: 3 }]));
    expect(result.current.player.currentIndex).toBe(1);
    expect(result.current.player.score).toBe(10);
    expect(result.current.players.find((player) => player.uid === "other")!.score).toBe(90);
    await act(async () => { request.resolve(acknowledge(events(0))); });
    act(() => subscription.handlers!.players([me(), opponent()]));
    expect(result.current.player.revision).toBe(1);
    expect(result.current.player.currentIndex).toBe(1);
    expect(result.current.pendingCount).toBe(0);
  });

  it("ignores old-run and other-user answer acknowledgements", async () => {
    answer = async () => response({ runId: "old-run", player: { ...me(), runId: "old-run", revision: 1, score: 900 }, status: "finished" });
    const { result } = mount(); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    await tick(250);
    expect(result.current.player.score).toBe(10); expect(result.current.pendingCount).toBe(1);
    expect(result.current.room.status).toBe("playing");
    act(() => subscription.handlers!.room({ ...room, runId: "old-run", status: "finished" }));
    act(() => subscription.handlers!.players([{ ...me(), uid: "stranger", runId: "old-run", revision: 99, score: 900 }]));
    expect(result.current.player.uid).toBe("me"); expect(result.current.player.score).toBe(10);
    expect(result.current.players.some((player) => player.uid === "other")).toBe(true);
    answer = async () => response({ runId: room.runId, player: { ...me(), uid: "stranger", revision: 1 }, status: "finished" });
    act(() => result.current.retrySync());
    await tick(1000);
    expect(result.current.pendingCount).toBe(1); expect(result.current.room.status).toBe("playing");
  });

  it("ignores a delayed old-run bootstrap before it changes identity or the calibrated clock", async () => {
    const lookup = deferred<Response>();
    fetchMock.mockImplementation((input, init) => String(input).startsWith("/api/vocab/game-room?") ? lookup.promise : answer(JSON.parse(init!.body as string).events));
    const { result } = mount(); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    await tick(250);
    await act(async () => { lookup.resolve(response({ room: { ...room, runId: "old-run", serverNow: start + 999999 }, players: [{ ...opponent(), runId: "old-run" }], currentUserId: "other", serverNow: start + 999999 })); });
    expect(result.current.room.runId).toBe(room.runId);
    expect(result.current.player.uid).toBe("me");
    expect(result.current.player.currentIndex).toBe(1);
    expect(result.current.player.score).toBe(10);
    expect(result.current.now).toBeLessThan(start + 1000);
  });

  it("lets manual retry recover the queue after automatic attempts stop", async () => {
    answer = async () => { throw new TypeError("Offline"); };
    const { result } = mount(); await tick();
    act(() => result.current.submit({ type: "answer", questionIndex: 0, selected: "apple" }));
    await tick(20000);
    const attempts = posts().length;
    expect(attempts).toBe(5); expect(result.current.pendingCount).toBe(1);
    await tick(5000); expect(posts()).toHaveLength(attempts);
    answer = async (batch) => acknowledge(batch);
    act(() => result.current.retrySync()); await tick();
    expect(posts()).toHaveLength(attempts + 1);
    expect(result.current.pendingCount).toBe(0); expect(result.current.syncError).toBe("");
  });

  it("restores pending immutable events and preserves acknowledged revisions on refresh", async () => {
    const event: RaceEvent = { type: "answer", questionIndex: 0, selected: "apple", seq: 1, at: start };
    sessionStorage.setItem(`vocab-race:${room.code}:${room.runId}:me`, JSON.stringify([event]));
    const { result } = mount(); await tick();
    expect(result.current.player.currentIndex).toBe(1); expect(result.current.pendingCount).toBe(1);
    await tick(250);
    expect(events(0)).toEqual([event]);
    expect(result.current.pendingCount).toBe(0);
    expect(sessionStorage.getItem(`vocab-race:${room.code}:${room.runId}:me`)).toBeNull();
  });

  it("drops a restored event already committed on the server without replaying or duplicating score", async () => {
    const event: RaceEvent = { type: "answer", questionIndex: 0, selected: "apple", seq: 1, at: start };
    serverPlayer = advanceRacePlayer(me(), event, words, "blast", 5000);
    sessionStorage.setItem(`vocab-race:${room.code}:${room.runId}:me`, JSON.stringify([event]));
    const { result } = mount(); await tick(300);
    expect(posts()).toHaveLength(0);
    expect(result.current.player.score).toBe(10); expect(result.current.player.revision).toBe(1);
    expect(result.current.pendingCount).toBe(0);
    expect(sessionStorage.getItem(`vocab-race:${room.code}:${room.runId}:me`)).toBeNull();
  });

  it("does not finish the room when only my word list has ended", async () => {
    const finished = { ...me(), currentIndex: words.length, status: "finished" as const, revision: 4, score: 40, correctCount: 4 };
    serverPlayer = finished;
    const { result } = mount(finished); await tick();
    expect(result.current.isPlayerFinished).toBe(true);
    expect(result.current.isFinished).toBe(false);
    expect(result.current.players.find((player) => player.uid === "other")!.status).toBe("playing");
  });

  it("clamps delayed finish to the shared deadline and refreshes finalization after the disconnected-player grace", async () => {
    const { result } = mount(); await tick();
    getRoom = { ...room, status: "finished" };
    await tick(135100);
    const finish = events(0)[0];
    expect(finish.type).toBe("finish"); expect(finish.at).toBe(room.matchEndsAt);
    const gets = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/vocab/game-room?"));
    expect(gets.length).toBeGreaterThan(1);
    expect(result.current.room.status).toBe("finished");
    expect(result.current.isFinished).toBe(true);
  });

  it("aborts a hung finalization GET after fifteen seconds and retries to finish the room", async () => {
    const healthyFetch = fetchMock.getMockImplementation()!;
    let lookups = 0;
    let hungSignal: AbortSignal | null = null;
    fetchMock.mockImplementation((input, init) => {
      if (!String(input).startsWith("/api/vocab/game-room?")) return healthyFetch(input, init);
      lookups++;
      if (lookups !== 2) {
        if (lookups > 2) getRoom = { ...room, status: "finished", updatedAt: Date.now() };
        return healthyFetch(input, init);
      }
      hungSignal = init!.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => { hungSignal!.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true }); });
    });
    const { result } = mount(); await tick();
    await tick(135000);
    expect(lookups).toBe(2);
    expect(hungSignal!.aborted).toBe(false);
    expect(result.current.room.status).toBe("playing");
    await tick(14900);
    expect(hungSignal!.aborted).toBe(false);
    await tick(100);
    expect(hungSignal!.aborted).toBe(true);
    await tick(100);
    expect(lookups).toBe(3);
    expect(result.current.isFinished).toBe(true);
  });

  it("returns a finished old run to the lobby when a newer run snapshot arrives without a waiting snapshot", async () => {
    const finishedRoom = { ...room, status: "finished" as const };
    const finishedPlayer = { ...me(), status: "finished" as const };
    getRoom = finishedRoom; serverPlayer = finishedPlayer;
    const lobby = vi.fn();
    mount(finishedPlayer, finishedRoom, lobby); await tick();
    act(() => subscription.handlers!.room({ ...room, runId: "run-2", status: "playing", updatedAt: start + 5000 }));
    expect(lobby).toHaveBeenCalledTimes(1);
  });

  it("ignores cached unversioned waiting snapshots but accepts an authoritative newer lobby", async () => {
    const lobby = vi.fn();
    const { result } = mount(me(), room, lobby); await tick();
    const staleWaiting = { ...room, status: "waiting" as const }; delete staleWaiting.updatedAt;
    act(() => subscription.handlers!.room(staleWaiting));
    expect(lobby).not.toHaveBeenCalled();
    expect(result.current.room.status).toBe("playing");
    act(() => subscription.handlers!.room({ ...room, status: "waiting", updatedAt: start + 1000 }));
    expect(lobby).toHaveBeenCalledTimes(1);
  });
});
