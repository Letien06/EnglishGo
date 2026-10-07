import React, { useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceRacePlayer, createRacePlayer, type RaceRoom, type RacePlayer } from "@/lib/vocab-race";
import { MultiplayerVocabularyRain } from "./MultiplayerVocabularyRain";

const mock = vi.hoisted(() => ({ hook: vi.fn(), subscribe: vi.fn() }));
vi.mock("./useVocabRace", () => ({ useVocabRace: (...args: unknown[]) => mock.hook(...args) }));
vi.mock("@/lib/game-room-subscription", () => ({ subscribeGameRoom: (...args: unknown[]) => mock.subscribe(...args) }));
vi.mock("./MultiplayerCountdown", () => ({ MultiplayerCountdown: () => <p>Đếm ngược</p> }));

const words = [
  { id: 1, word: "carry", meaning: "mang theo", mastered: false },
  { id: 2, word: "office", meaning: "văn phòng", mastered: false },
  { id: 3, word: "invoice", meaning: "hóa đơn", mastered: false },
];
const room: RaceRoom = { code: "RAIN99", hostId: "user-1", gameMode: "rain", status: "playing", words, runId: "run-1", serverNow: 1000, countdownEndsAt: 1000, matchEndsAt: 121000 };
const initialPlayers = [
  createRacePlayer({ uid: "user-1", displayName: "Player 1" }, room),
  createRacePlayer({ uid: "user-2", displayName: "Player 2" }, room),
];
type View = {
  room: RaceRoom; players: RacePlayer[]; player: RacePlayer; words: typeof words; now: number;
  isCountdown: boolean; isFinished: boolean; isPlayerFinished: boolean; pendingCount: number;
  isClockReady: boolean; clockError: string;
  syncError: string | null; resetting: boolean; resetError: string | null;
  submit: ReturnType<typeof vi.fn>; retrySync: ReturnType<typeof vi.fn>; returnToLobby: ReturnType<typeof vi.fn>;
};
let snapshot: View;
const listeners = new Set<() => void>();
function update(changes: Partial<View>) {
  snapshot = { ...snapshot, ...changes };
  for (const listener of listeners) listener();
}
function useMockRace() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => snapshot);
}
function mount(uid = "user-1") {
  return render(<MultiplayerVocabularyRain roomCode="RAIN99" initialRoom={room} initialPlayers={initialPlayers} currentUserId={uid} muted={true} onExit={vi.fn()} onReturnToLobby={vi.fn()} />);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("React", React);
  mock.hook.mockImplementation(useMockRace);
  const submit = vi.fn((event: { type: "answer" | "timeout" | "finish"; questionIndex: number; selected?: string }) => {
    const player = advanceRacePlayer(snapshot.player, { ...event, at: snapshot.now, seq: snapshot.player.revision + 1 }, words, "rain");
    update({ player, players: snapshot.players.map((value) => value.uid === player.uid ? player : value), isPlayerFinished: player.status !== "playing", pendingCount: snapshot.pendingCount + 1 });
  });
  snapshot = { room, players: initialPlayers, player: initialPlayers[0], words, now: 1000, isCountdown: false, isFinished: false, isPlayerFinished: false, pendingCount: 0, isClockReady: true, clockError: "", syncError: null, resetting: false, resetError: null, submit, retrySync: vi.fn(), returnToLobby: vi.fn(() => update({ resetError: "Không thể trở lại phòng." })) };
});
afterEach(() => { cleanup(); listeners.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("independent multiplayer rain", () => {
  it("keeps clock recovery and exit available during gated countdown", () => {
    snapshot = { ...snapshot, isCountdown: true, isClockReady: false, clockError: "Chưa kết nối được đồng hồ trận đấu.", room: { ...room, countdownEndsAt: undefined } };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent(snapshot.clockError);
    fireEvent.click(screen.getByRole("button", { name: "Thử đồng bộ lại" }));
    expect(snapshot.retrySync).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Rời phòng" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("keeps optimistic personal progress when real subscription replays a stale revision", async () => {
    const real = await vi.importActual<typeof import("./useVocabRace")>("./useVocabRace");
    mock.hook.mockImplementation(real.useVocabRace);
    mock.subscribe.mockReturnValue(() => {});
    vi.setSystemTime(1000);
    sessionStorage.clear();
    const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "carry" } });
    expect(screen.queryByText("mang theo")).not.toBeInTheDocument();
    const handlers = mock.subscribe.mock.calls[0][1] as { players: (players: RacePlayer[]) => void };
    act(() => handlers.players(initialPlayers));
    expect(screen.queryByText("mang theo")).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(250); });
    expect(fetcher).toHaveBeenCalledWith("/api/vocab/game-room/answer", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("hóa đơn")).toBeInTheDocument();
    const body = JSON.parse(String(fetcher.mock.calls.find((call) => String(call[0]).endsWith("/answer"))?.[1]?.body));
    expect(body.events).toEqual([expect.objectContaining({ type: "answer", questionIndex: 0, selected: "carry", seq: 1 })]);
  });
  it("renders only personal drops and keeps them unchanged after an opponent catch", () => {
    mount();
    expect(screen.getByText("mang theo")).toBeInTheDocument();
    const opponent = advanceRacePlayer(initialPlayers[1], { seq: 1, type: "answer", questionIndex: 0, selected: "carry", at: 1000 }, words, "rain");
    act(() => update({ players: [snapshot.player, opponent], room: { ...room, currentIndex: 2 } }));
    expect(screen.getByText("mang theo")).toBeInTheDocument();
    expect(screen.getByLabelText("Còn 3 mạng")).toBeInTheDocument();
    expect(snapshot.submit).not.toHaveBeenCalled();
  });
  it("catches its own word immediately while synchronization remains pending", () => {
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "carry" } });
    expect(snapshot.submit).toHaveBeenCalledWith({ type: "answer", questionIndex: 0, selected: "carry" });
    expect(screen.queryByText("mang theo")).not.toBeInTheDocument();
    expect(snapshot.player.score).toBe(10);
    expect(screen.getByText(/1 lượt đang đồng bộ/)).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(snapshot.players[1]).toEqual(initialPlayers[1]);
    act(() => update({ now: 1200 }));
    expect(screen.getByText("hóa đơn")).toBeInTheDocument();
  });
  it("expires only own active drops exactly once and never while eliminated", () => {
    mount();
    act(() => update({ now: 14000 }));
    expect(snapshot.submit).toHaveBeenCalledTimes(1);
    expect(snapshot.submit).toHaveBeenCalledWith({ type: "timeout", questionIndex: 0 });
    expect(snapshot.player.lives).toBe(2);
    expect(snapshot.players[1].lives).toBe(3);
    act(() => update({ now: 14001 }));
    expect(snapshot.submit).toHaveBeenCalledTimes(1);
    act(() => update({ isPlayerFinished: true, player: { ...snapshot.player, lives: 0, status: "eliminated" }, now: 50000 }));
    expect(snapshot.submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("waits for opponents after own last catch instead of ending the room", () => {
    const player = { ...initialPlayers[0], activeDrops: [{ index: 2, lane: 0, spawnAt: 1000 }], nextIndex: 3 };
    snapshot = { ...snapshot, player, players: [player, initialPlayers[1]] };
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "invoice" } });
    expect(screen.getByText("Bạn đã hoàn thành lượt chơi!")).toBeInTheDocument();
    expect(screen.getByText(/Đang chờ các đối thủ/)).toBeInTheDocument();
    expect(screen.queryByText("TỔNG KẾT MƯA TỪ VỰNG")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("keeps typing mistakes local until submission, then resets only own combo", () => {
    snapshot = { ...snapshot, player: { ...snapshot.player, combo: 4 } };
    mount();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "typo" } });
    expect(snapshot.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bắt từ" }));
    expect(snapshot.player.combo).toBe(0);
    expect(snapshot.player.lives).toBe(3);
  });
  it("shows sync errors with retry and keeps final results after reset fails", () => {
    snapshot = { ...snapshot, isFinished: true, room: { ...room, status: "finished" }, syncError: "Mất kết nối" };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Thử đồng bộ lại" }));
    expect(snapshot.retrySync).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Quay lại phòng chơi tiếp" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Không thể trở lại phòng.");
    expect(screen.getByText("TỔNG KẾT MƯA TỪ VỰNG")).toBeInTheDocument();
  });
  it("shows exact ties and lets only host request rematch", () => {
    snapshot = { ...snapshot, isFinished: true, room: { ...room, status: "finished" } };
    mount("user-2");
    expect(screen.getByText("Đồng quán quân")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quay lại phòng chơi tiếp" })).not.toBeInTheDocument();
    expect(screen.getByText(/Đang chờ chủ phòng/)).toBeInTheDocument();
  });
});
