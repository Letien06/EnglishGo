import { describe, expect, it } from "vitest";
import { advanceRacePlayer, compareRacePlayers, createRacePlayer, racePoints, RACE_RAIN_DROP_MS, type RaceEvent, type RaceRoom } from "./vocab-race";
const words = Array.from({ length: 15 }, (_, index) => ({ id: index + 1, word: `word${index}`, meaning: `nghĩa ${index}`, mastered: false }));
const room: RaceRoom = { code: "RACE", hostId: "u", gameMode: "rain", status: "playing", runId: "run", countdownEndsAt: 1000, words };
describe("personal vocabulary race transitions", () => {
  it("scores tiers at combos 1,4,7,10, caps at40 and retains maxcombo after a mistake", () => {
    expect([1, 3, 4, 6, 7, 9, 10, 100].map(racePoints)).toEqual([10, 10, 20, 20, 30, 30, 40, 40]);
    let player = createRacePlayer({ uid: "u" }, { ...room, gameMode: "blast" });
    for (let index = 0; index < 11; index++) {
      player = advanceRacePlayer(player, { seq: index + 1, type: "answer", questionIndex: index, selected: words[index].word, at: player.questionStartedAt }, words, "blast");
    }
    expect(player).toMatchObject({ combo: 11, maxCombo: 11, score: 260, correctCount: 11 });
    player = advanceRacePlayer(player, { seq: 12, type: "answer", questionIndex: 11, selected: "wrong", at: player.questionStartedAt }, words, "blast");
    expect(player).toMatchObject({ combo: 0, maxCombo: 11, score: 260, lives: 2 });
  });
  it("keeps both personal drops on typo and expires just one lane", () => {
    const initial = { ...createRacePlayer({ uid: "u" }, room), combo: 4 };
    const opponent = createRacePlayer({ uid: "opponent" }, room);
    const wrong = advanceRacePlayer(initial, { seq: 1, type: "answer", questionIndex: 0, selected: "typo", at: 1000 }, words, "rain");
    expect(wrong).toMatchObject({ lives: 3, combo: 0, activeDrops: initial.activeDrops });
    const expired = advanceRacePlayer(wrong, { seq: 2, type: "timeout", questionIndex: 0, at: 1000 + RACE_RAIN_DROP_MS }, words, "rain");
    expect(expired.lives).toBe(2);
    expect(expired.activeDrops).toEqual([initial.activeDrops[1], { index: 2, lane: 0, spawnAt: 14200 }]);
    expect(opponent).toEqual(createRacePlayer({ uid: "opponent" }, room));
  });
  it("rejects early expiration, early replacement answers and sequence gaps", () => {
    const initial = createRacePlayer({ uid: "u" }, room);
    const apply = (event: RaceEvent) => advanceRacePlayer(initial, event, words, "rain");
    expect(() => apply({ seq: 1, type: "timeout", questionIndex: 0, at: 13999 })).toThrow(/not expired/);
    expect(() => apply({ seq: 2, type: "answer", questionIndex: 0, selected: "word0", at: 1000 })).toThrow(/gap/);
    const caught = apply({ seq: 1, type: "answer", questionIndex: 0, selected: "word0", at: 1000 });
    expect(() => advanceRacePlayer(caught, { seq: 2, type: "answer", questionIndex: 2, selected: "word2", at: 1199 }, words, "rain")).toThrow(/not started/);
    expect(advanceRacePlayer(caught, { seq: 2, type: "answer", questionIndex: 2, selected: "word2", at: 1200 }, words, "rain").score).toBe(20);
  });
  it("finishes only after both final drops resolve and ignores repeated receipts", () => {
    const short = words.slice(0, 2);
    const initial = createRacePlayer({ uid: "u" }, { ...room, words: short });
    const event: RaceEvent = { seq: 1, type: "answer", questionIndex: 0, selected: "word0", at: 1000 };
    const one = advanceRacePlayer(initial, event, short, "rain");
    expect(one.status).toBe("playing");
    expect(one.activeDrops).toEqual([initial.activeDrops[1]]);
    expect(advanceRacePlayer(one, event, short, "rain")).toBe(one);
    const done = advanceRacePlayer(one, { seq: 2, type: "answer", questionIndex: 1, selected: "word1", at: 4800 }, short, "rain");
    expect(done).toMatchObject({ status: "finished", score: 20, correctCount: 2, activeDrops: [] });
  });
  it("treats a late correct answer as its own expiration and supports exact ranking ties", () => {
    const initial = createRacePlayer({ uid: "u" }, room);
    const expired = advanceRacePlayer(initial, { seq: 1, type: "answer", questionIndex: 0, selected: "word0", at: 14000 }, words, "rain");
    expect(expired).toMatchObject({ score: 0, correctCount: 0, lives: 2, combo: 0 });
    expect(compareRacePlayers({ score: 20, correctCount: 2 }, { score: 20, correctCount: 1 })).toBeLessThan(0);
    const other = { ...initial, uid: "other" };
    expect(compareRacePlayers(initial, other)).toBe(0);
  });
  it("creates an already completed personal player for empty decks", () => {
    expect(createRacePlayer({ uid: "u" }, { ...room, words: [] })).toMatchObject({ status: "finished", activeDrops: [] });
  });
});
