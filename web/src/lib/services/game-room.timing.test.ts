import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/types";

const mock = vi.hoisted(() => ({ room: {} as Record<string, unknown>, update: vi.fn() }));
type Ref = { path: string; doc: (id: string) => Ref; collection: (name: string) => Ref };
const players = [{ uid: "player", lives: 3, score: 0, combo: 0 }, { uid: "other", lives: 3, score: 0, combo: 0 }];
function ref(path: string): Ref { return { path, doc: (id) => ref(`${path}/${id}`), collection: (name) => ref(`${path}/${name}`) }; }
vi.mock("@/lib/firebase/admin", () => ({ adminDb: {
  collection: (name: string) => ref(name),
  runTransaction: async (reader: (tx: unknown) => Promise<unknown>) => reader({
    get: async (reference: Ref) => reference.path.endsWith("/players")
      ? { docs: players.map((player) => ({ id: player.uid, ref: ref(`${reference.path}/${player.uid}`), data: () => player })) }
      : reference.path.includes("/players/")
        ? { exists: true, data: () => players[0] }
        : { exists: true, data: () => mock.room },
    update: mock.update,
  }),
} }));
import { advanceQuestion, startGame, submitAnswer } from "./game-room";

const user = { uid: "player", displayName: "Player" } as AppUser;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  vi.clearAllMocks();
  mock.room = { gameMode: "blast", status: "playing", hostId: "player", currentIndex: 0, roundStartedAt: 100000, questionDurationMs: 5000, questionAnswers: {}, words: [{ id: 1, word: "apple" }, { id: 2, word: "banana" }] };
});
afterEach(() => vi.useRealTimers());

describe("authoritative Word Blast timing", () => {
  it("stores a three-second Blast countdown and five-second questions, while Rain keeps five seconds", async () => {
    mock.room.status = "waiting";
    const blast = await startGame(user, "ROOM");
    expect(blast).toMatchObject({ countdownEndsAt: 103000, roundStartedAt: 103000, questionDurationMs: 5000 });
    expect(mock.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ questionDurationMs: 5000 }));
    mock.room.gameMode = "rain";
    const rain = await startGame(user, "ROOM");
    expect(rain.countdownEndsAt).toBe(105000);
    expect(rain).not.toHaveProperty("questionDurationMs");
  });
  it("accepts answers just before expiry and rejects the exact five-second deadline", async () => {
    vi.setSystemTime(104999);
    expect(await submitAnswer(user, "ROOM", 0, true, "apple")).toMatchObject({ advanced: true });
    mock.update.mockClear();
    vi.setSystemTime(105000);
    expect(await submitAnswer(user, "ROOM", 0, true, "apple")).toMatchObject({ skipped: true, reason: "Time expired" });
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("prevents early next requests and permits advancing at expiry", async () => {
    vi.setSystemTime(104999);
    expect(await advanceQuestion(user, "ROOM", 0)).toMatchObject({ currentIndex: 0 });
    expect(mock.update).not.toHaveBeenCalled();
    vi.setSystemTime(105000);
    expect(await advanceQuestion(user, "ROOM", 0)).toMatchObject({ currentIndex: 1 });
  });
  it("preserves all-answered advancement but prevents skipping the pregame countdown", async () => {
    mock.room.questionAnswers = { player: { correct: false }, other: { correct: false } };
    expect(await advanceQuestion(user, "ROOM", 0)).toMatchObject({ currentIndex: 1 });
    mock.update.mockClear();
    mock.room.status = "countdown";
    mock.room.roundStartedAt = 103000;
    expect(await advanceQuestion(user, "ROOM", 0)).toMatchObject({ currentIndex: 0 });
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("keeps active legacy rooms at seven seconds and refuses non-player advancement", async () => {
    delete mock.room.questionDurationMs;
    vi.setSystemTime(106000);
    expect(await advanceQuestion(user, "ROOM", 0)).toMatchObject({ currentIndex: 0 });
    vi.setSystemTime(107000);
    expect(await advanceQuestion(user, "ROOM", 0)).toMatchObject({ currentIndex: 1 });
    await expect(advanceQuestion({ ...user, uid: "outsider" }, "ROOM", 0)).rejects.toThrow("not a player");
  });
});
