import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/types";
import { createRacePlayer, type RaceEvent, type RaceRoom } from "@/lib/vocab-race";

type StoredDocument = Record<string, unknown>;
type DocumentSnapshot = { exists: boolean; data(): StoredDocument | undefined };
type QuerySnapshot = { docs: { id: string; ref: Ref; data(): StoredDocument }[]; size: number };
type Snapshot = DocumentSnapshot | QuerySnapshot;
type Transaction = { get(target: Ref): Promise<Snapshot>; update(target: Ref, patch: StoredDocument): void; delete(target: Ref): void };
const state = vi.hoisted(() => ({ docs: new Map<string, StoredDocument>(), reads: [] as string[], writes: [] as string[] }));
type Ref = { path: string; doc(id: string): Ref; collection(name: string): Ref; get(): Promise<Snapshot> };
function ref(path: string): Ref {
  return { path, doc: id => ref(`${path}/${id}`), collection: name => ref(`${path}/${name}`), get: () => read(path) };
}
async function read(path: string): Promise<Snapshot> {
  state.reads.push(path);
  if (path.endsWith("/players")) {
    const docs = [...state.docs.entries()].filter(([key]) => key.startsWith(`${path}/`)).map(([key, value]) => ({ id: key.split("/").at(-1)!, ref: ref(key), data: () => structuredClone(value) }));
    return { docs, size: docs.length };
  }
  const value = state.docs.get(path);
  return { exists: !!value, data: () => value ? structuredClone(value) : undefined };
}
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: async <T,>(callback: (tx: Transaction) => Promise<T>): Promise<T> => {
    const pending: (() => void)[] = [];
    const result = await callback({
      get: (target: Ref) => read(target.path),
      update: (target: Ref, patch: StoredDocument) => { state.writes.push(target.path); pending.push(() => state.docs.set(target.path, { ...state.docs.get(target.path), ...patch })); },
      delete: (target: Ref) => pending.push(() => state.docs.delete(target.path)),
    });
    pending.forEach(write => write());
    return result;
  },
} }));
import { COLLECTIONS } from "@/lib/firestore/collections";
import { submitRaceEvents, advanceQuestion, expireRainDrop, resetRoomToLobby, leaveRoom, getRoomWithPlayers, joinRoom, startGame } from "./game-room";

const user = { uid: "player", displayName: "Player" } as AppUser;
const path = `${COLLECTIONS.gameRooms}/ROOM12`;
const runId = "c272bb0d-57a8-4893-89ac-6afde71d9c99";
let room: RaceRoom;
function answer(seq = 1, questionIndex = 0, selected = "apple", at = 100100): RaceEvent { return { seq, type: "answer", questionIndex, selected, at }; }
function player(uid = "player") { return state.docs.get(`${path}/players/${uid}`)!; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(101000); state.docs.clear(); state.reads.length = 0; state.writes.length = 0;
  room = { code: "ROOM12", hostId: "player", raceVersion: 2, runId, gameMode: "blast", status: "countdown", countdownEndsAt: 100000, matchEndsAt: 220000, questionDurationMs: 5000, words: [{ id: 1, word: "apple", meaning: "táo", mastered: false }, { id: 2, word: "banana", meaning: "chuối", mastered: false }] };
  state.docs.set(path, { ...room });
  for (const uid of ["player", "other"]) state.docs.set(`${path}/players/${uid}`, { ...createRacePlayer({ uid }, room) });
});
afterEach(() => vi.useRealTimers());
describe("authoritative independent races", () => {
  it("rejects an empty deck before loading players or writing a countdown", async () => {
    state.docs.set(path, { ...room, status: "waiting", words: [] });
    await expect(startGame(user, "ROOM12")).rejects.toThrow("Add vocabulary words");
    expect(state.docs.get(path)?.status).toBe("waiting");
    expect(state.reads).not.toContain(`${path}/players`);
    expect(state.writes).toEqual([]);
  });
  it("advances only caller, derives score from selected answer, and avoids room/roster writes", async () => {
    const result = await submitRaceEvents(user, "ROOM12", runId, [answer()]);
    expect(result.player).toMatchObject({ currentIndex: 1, score: 10, correctCount: 1, revision: 1 });
    expect(player("other")).toMatchObject({ currentIndex: 0, score: 0 });
    expect(state.reads).not.toContain(`${path}/players`);
    expect(state.writes).toEqual([`${path}/players/player`]);
  });
  it("does not reapply retried batches or repeat wrong-answer heart penalties", async () => {
    await submitRaceEvents(user, "ROOM12", runId, [answer(1, 0, "wrong")]);
    await submitRaceEvents(user, "ROOM12", runId, [answer(1, 0, "wrong"), answer(2, 0, "wrong")]);
    expect(player()).toMatchObject({ lives: 2, score: 0, currentIndex: 0, revision: 2 });
  });
  it("rejects gaps, future times, premature finish and outsider submissions atomically", async () => {
    await expect(submitRaceEvents(user, "ROOM12", runId, [answer(), answer(3)])).rejects.toThrow("sequence gap");
    await expect(submitRaceEvents(user, "ROOM12", runId, [answer(1, 0, "apple", 105000)])).rejects.toThrow("event time");
    await expect(submitRaceEvents(user, "ROOM12", runId, [{ ...answer(), type: "finish" }])).rejects.toThrow("not ended");
    await expect(submitRaceEvents({ ...user, uid: "outsider" }, "ROOM12", runId, [answer()])).rejects.toThrow("not a player");
    expect(player().revision).toBe(0);
  });
  it("ignores prior-run queues and legacy endpoints without changing race state", async () => {
    expect(await submitRaceEvents(user, "ROOM12", "old-run", [answer()])).toMatchObject({ skipped: true, reason: "Race changed" });
    expect(await advanceQuestion(user, "ROOM12", 0)).toMatchObject({ skipped: true });
    expect(await expireRainDrop(user, "ROOM12", 0)).toMatchObject({ skipped: true });
    expect(state.writes).toEqual([]);
  });
  it("allows existing players to resume an active room and rejects newcomers", async () => {
    expect(await joinRoom(user, "ROOM12")).toMatchObject({ gameMode: "blast" });
    await expect(joinRoom({ ...user, uid: "newcomer" }, "ROOM12")).rejects.toThrow("already started");
  });
  it("blocks countdown submissions and invalid deck indices", async () => {
    vi.setSystemTime(99999);
    expect(await submitRaceEvents(user, "ROOM12", runId, [answer()])).toMatchObject({ skipped: true, reason: "Countdown is active" });
    vi.setSystemTime(101000);
    await expect(submitRaceEvents(user, "ROOM12", runId, [answer(1, 20)])).rejects.toThrow("question index");
    expect(player().revision).toBe(0);
  });
  it("accepts queued events during transport grace, but rejects packets after grace", async () => {
    vi.setSystemTime(230000);
    await submitRaceEvents(user, "ROOM12", runId, [answer()]);
    expect(player()).toMatchObject({ score: 10, revision: 1 });
    vi.setSystemTime(235000);
    expect(await submitRaceEvents(user, "ROOM12", runId, [answer(2, 1, "banana", 100400)])).toMatchObject({ skipped: true, reason: "Race deadline passed" });
    expect(player().score).toBe(10);
  });
  it("requires finish time at the shared deadline and ignores duplicate finish retries", async () => {
    vi.setSystemTime(220010);
    await expect(submitRaceEvents(user, "ROOM12", runId, [{ ...answer(), type: "finish", at: 220010 }])).rejects.toThrow("event time");
    const finish = { ...answer(), type: "finish" as const, at: 220000 };
    expect(await submitRaceEvents(user, "ROOM12", runId, [finish])).toMatchObject({ player: { status: "finished", revision: 1, score: 0 } });
    state.writes.length = 0;
    expect(await submitRaceEvents(user, "ROOM12", runId, [finish])).toMatchObject({ skipped: true, player: { revision: 1 } });
    expect(state.writes).toEqual([]);
  });
  it("blocks host reset while another racer is still playing", async () => {
    await expect(resetRoomToLobby(user, "ROOM12")).rejects.toThrow("race to finish");
    expect(state.writes).toEqual([]);
  });
  it("allows the host to migrate an active legacy room without permitting member resets", async () => {
    state.docs.set(path, { ...room, raceVersion: 1, status: "playing" });
    await expect(resetRoomToLobby({ ...user, uid: "other" }, "ROOM12")).rejects.toThrow("Only the host");
    expect(await resetRoomToLobby(user, "ROOM12")).toMatchObject({ status: "waiting" });
    expect(state.docs.get(path)?.status).toBe("waiting");
  });
  it("does not end the room when first player completes; ends after last player", async () => {
    const events = [answer(), answer(2, 1, "banana", 100400)];
    await submitRaceEvents(user, "ROOM12", runId, events);
    expect(state.docs.get(path)?.status).toBe("countdown");
    await submitRaceEvents({ ...user, uid: "other" }, "ROOM12", runId, events);
    expect(state.docs.get(path)?.status).toBe("finished");
  });
  it("expires only caller's Rain drop and rejects premature expiry", async () => {
    room.gameMode = "rain"; state.docs.set(path, { ...room });
    for (const uid of ["player", "other"]) state.docs.set(`${path}/players/${uid}`, { ...createRacePlayer({ uid }, room) });
    await expect(submitRaceEvents(user, "ROOM12", runId, [{ ...answer(), type: "timeout" }])).rejects.toThrow("not expired");
    vi.setSystemTime(113000);
    await submitRaceEvents(user, "ROOM12", runId, [{ ...answer(1, 0, "", 113000), type: "timeout" }]);
    expect(player()).toMatchObject({ lives: 2, revision: 1 });
    expect(player("other")).toMatchObject({ lives: 3, revision: 0 });
  });
  it("finalizes abandoned players after transport grace and restricts reset to host", async () => {
    vi.setSystemTime(235000);
    const data = await getRoomWithPlayers("ROOM12");
    expect(data.room?.status).toBe("finished");
    expect(data.players.every(value => value.status === "finished")).toBe(true);
    await expect(resetRoomToLobby({ ...user, uid: "other" }, "ROOM12")).rejects.toThrow("Only the host");
  });
  it("finishes when the remaining players are terminal after a player leaves", async () => {
    state.docs.set(`${path}/players/other`, { ...player("other"), status: "finished" });
    await leaveRoom(user, "ROOM12");
    expect(state.docs.get(path)).toMatchObject({ status: "finished", hostId: "other" });
  });
});
