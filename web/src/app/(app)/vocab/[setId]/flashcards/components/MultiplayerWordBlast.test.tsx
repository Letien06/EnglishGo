import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { advanceRacePlayer, createRacePlayer, type RaceRoom } from "@/lib/vocab-race";
import { MultiplayerWordBlast } from "./MultiplayerWordBlast";

const store = vi.hoisted(() => ({ value: null as unknown, listeners: new Set<() => void>(), submit: vi.fn(), retry: vi.fn(), reset: vi.fn() }));
vi.mock("./useVocabRace", async () => {
  const { useSyncExternalStore } = await import("react");
  return { useVocabRace: () => useSyncExternalStore((listener) => { store.listeners.add(listener); return () => { store.listeners.delete(listener); }; }, () => store.value) };
});
vi.mock("./MultiplayerCountdown", () => ({ MultiplayerCountdown: () => <div>Đang đếm ngược</div> }));
vi.mock("./MultiplayerScoreboard", () => ({ MultiplayerScoreboard: ({ players }: { players: { uid: string; displayName: string; score: number }[] }) => <div aria-label="Bảng điểm trực tiếp">{players.map((player) => <span key={player.uid}>{player.displayName}: {player.score}</span>)}</div> }));

const words = [
  { id: 1, word: "apple", meaning: "quả táo", mastered: false },
  { id: 2, word: "banana", meaning: "quả chuối", mastered: false },
  { id: 3, word: "orange", meaning: "quả cam", mastered: false },
  { id: 4, word: "grape", meaning: "quả nho", mastered: false },
];
const room: RaceRoom = { code: "BLST99", hostId: "me", gameMode: "blast", status: "playing", words, runId: "run-1", countdownEndsAt: 10000, matchEndsAt: 130000, questionDurationMs: 5000 };
const initialPlayers = [createRacePlayer({ uid: "me", displayName: "Bạn" }, room), createRacePlayer({ uid: "other", displayName: "Đối thủ" }, room)];
function initial() {
  return { room, players: initialPlayers, player: initialPlayers[0], words, now: 10000, isCountdown: false, isClockReady: true, clockError: "", isFinished: false, isPlayerFinished: false, pendingCount: 0, syncError: null as string | null, submit: store.submit, retrySync: store.retry, resetting: false, resetError: null as string | null, returnToLobby: store.reset };
}
function current() { return store.value as ReturnType<typeof initial>; }
function update(patch: Partial<ReturnType<typeof initial>>) {
  store.value = { ...current(), ...patch };
  store.listeners.forEach((listener) => listener());
}
function mount() {
  return render(<MultiplayerWordBlast roomCode="BLST99" initialRoom={room} initialPlayers={initialPlayers} currentUserId="me" muted onExit={vi.fn()} onReturnToLobby={vi.fn()} />);
}
beforeEach(() => {
  vi.clearAllMocks(); store.listeners.clear(); store.value = initial();
  store.submit.mockImplementation((event: { type: "answer" | "timeout" | "finish"; questionIndex: number; selected?: string }) => {
    const state = current();
    const player = advanceRacePlayer(state.player, { ...event, seq: state.player.revision + 1, at: state.now }, words, "blast", 5000);
    update({ player, players: state.players.map((entry) => entry.uid === "me" ? player : entry), pendingCount: state.pendingCount + 1, isPlayerFinished: player.status !== "playing" });
  });
  store.reset.mockResolvedValue(undefined);
});

describe("independent Word Blast score race", () => {
  it("keeps retry and exit available while clock synchronization fails without a countdown deadline", () => {
    const withoutDeadline = { ...room }; delete withoutDeadline.countdownEndsAt;
    store.value = { ...initial(), room: withoutDeadline, isCountdown: true, isClockReady: false, clockError: "Chưa đồng bộ được giờ trận đấu." };
    const exit = vi.fn();
    render(<MultiplayerWordBlast roomCode="BLST99" initialRoom={withoutDeadline} initialPlayers={initialPlayers} currentUserId="me" muted onExit={exit} />);
    expect(screen.getByText("Đang đếm ngược")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa đồng bộ được giờ trận đấu.");
    fireEvent.click(screen.getByRole("button", { name: "Thử kết nối lại" }));
    expect(store.retry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Rời phòng" }));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /apple/ })).not.toBeInTheDocument();
  });

  it("shows the combo multiplier and the maximum scoring rule", () => {
    store.value = { ...initial(), player: { ...initialPlayers[0], combo: 7 } };
    mount();
    expect(screen.getByLabelText("Hệ số combo")).toHaveTextContent("×3");
    expect(screen.getByText(/10 điểm × hệ số combo, tối đa ×4/)).toBeInTheDocument();
  });

  it("keeps my question while the opponent advances and stale room indices arrive", () => {
    mount();
    act(() => update({ room: { ...room, currentIndex: 3 }, players: [initialPlayers[0], { ...initialPlayers[1], currentIndex: 3, score: 80, correctCount: 3 }] }));
    expect(screen.getByText("Câu 1/4")).toBeInTheDocument();
    expect(screen.getByText("“quả táo”")).toBeInTheDocument();
    expect(screen.getByText("Đối thủ: 80")).toBeInTheDocument();
    act(() => update({ room: { ...room, currentIndex: 0 } }));
    expect(screen.getByText("Câu 1/4")).toBeInTheDocument();
    expect(store.submit).not.toHaveBeenCalled();
  });

  it("advances locally and accepts the next answer after 200ms without waiting for network acknowledgements", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /apple/ }));
    expect(screen.getByText("Câu 2/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /banana/ })).toBeDisabled();
    expect(screen.getByText(/Đang đồng bộ 1 lượt chơi/)).toBeInTheDocument();
    act(() => update({ now: 10200 }));
    fireEvent.click(screen.getByRole("button", { name: /banana/ }));
    expect(screen.getByText("Câu 3/4")).toBeInTheDocument();
    expect(current().player.correctCount).toBe(2);
    expect(current().pendingCount).toBe(2);
    expect(store.submit.mock.calls.map(([event]) => event)).toEqual([{ type: "answer", questionIndex: 0, selected: "apple" }, { type: "answer", questionIndex: 1, selected: "banana" }]);
  });

  it("disables a wrong target, loses one heart, and lets the player retry their own question", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /banana/ }));
    expect(screen.getByText("Câu 1/4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /banana/ })).toBeDisabled();
    expect(screen.getByLabelText("Còn 2 mạng")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /apple/ }));
    expect(screen.getByText("Câu 2/4")).toBeInTheDocument();
  });

  it("keeps keyboard 1–4 but ignores modifier shortcuts", () => {
    mount();
    const correct = screen.getByRole("button", { name: /apple/ });
    const number = correct.querySelector("kbd")!.textContent!;
    fireEvent.keyDown(window, { key: number, ctrlKey: true });
    expect(store.submit).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: number });
    expect(screen.getByText("Câu 2/4")).toBeInTheDocument();
  });

  it("submits a timeout once for my deadline and immediately starts my next question", () => {
    mount();
    act(() => update({ now: 15000 }));
    expect(store.submit).toHaveBeenCalledExactlyOnceWith({ type: "timeout", questionIndex: 0 });
    expect(screen.getByText("Câu 2/4")).toBeInTheDocument();
    act(() => update({ now: 15050 }));
    expect(store.submit).toHaveBeenCalledTimes(1);
  });

  it("shows a personal finish while the room and opponent are still playing", () => {
    store.value = { ...initial(), player: { ...initialPlayers[0], currentIndex: words.length, status: "finished", score: 40, correctCount: 4, maxCombo: 4 }, isPlayerFinished: true };
    mount();
    expect(screen.getByText("Bạn đã hoàn thành lượt chơi")).toBeInTheDocument();
    expect(screen.getByText(/Đối thủ vẫn đang chơi/)).toBeInTheDocument();
    expect(screen.getByLabelText("Bảng điểm trực tiếp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chơi lại" })).not.toBeInTheDocument();
  });

  it("stops input at the shared match deadline and queues finish only once", () => {
    mount();
    act(() => update({ now: 130000 }));
    expect(screen.getByText("Tổng kết trận đấu")).toBeInTheDocument();
    expect(store.submit).toHaveBeenCalledExactlyOnceWith({ type: "finish", questionIndex: 0 });
    act(() => update({ now: 130001 }));
    expect(store.submit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /apple/ })).not.toBeInTheDocument();
  });

  it("uses correct count as tie-breaker and recognizes exact shared winners", () => {
    const players = initialPlayers.map((player) => ({ ...player, score: 40, correctCount: 4 }));
    store.value = { ...initial(), players, player: players[0], isFinished: true };
    const view = mount();
    expect(screen.getByText("Đồng chiến thắng: Bạn, Đối thủ")).toBeInTheDocument();
    act(() => update({ players: [players[0], { ...players[1], correctCount: 5 }] }));
    view.rerender(<MultiplayerWordBlast roomCode="BLST99" initialRoom={room} initialPlayers={initialPlayers} currentUserId="me" muted onExit={vi.fn()} />);
    expect(screen.getByText("Người chiến thắng: Đối thủ")).toBeInTheDocument();
  });

  it("keeps the result screen and displays reset failure instead of navigating to the lobby", () => {
    store.value = { ...initial(), isFinished: true };
    store.reset.mockImplementation(() => { update({ resetError: "Chưa thể tạo trận mới." }); return Promise.resolve(false); });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Chơi lại" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa thể tạo trận mới.");
    expect(screen.getByText("Tổng kết trận đấu")).toBeInTheDocument();
  });

  it("exposes retryable syncing failures without disabling independent play", () => {
    store.value = { ...initial(), syncError: "Chưa đồng bộ được điểm.", pendingCount: 1 };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Thử đồng bộ lại" }));
    expect(store.retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /apple/ })).toBeEnabled();
  });
});
