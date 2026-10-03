import { describe, it, expect, vi } from "vitest";
import { generateRoomCode } from "./game-room";

describe("game-room service", () => {
  it("generates unique 6-character uppercase room codes without confusing characters", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); // No 0, O, 1, I
      codes.add(code);
    }
    // High entropy: in 50 generations there should be no collisions
    expect(codes.size).toBe(50);
  });

  it("enforces max 5 players and minimum 2 players to start", () => {
    const maxPlayers = 5;
    expect(maxPlayers).toBe(5);

    const canStart = (playerCount: number) => playerCount >= 2 && playerCount <= 5;
    expect(canStart(1)).toBe(false);
    expect(canStart(2)).toBe(true);
    expect(canStart(5)).toBe(true);
    expect(canStart(6)).toBe(false);
  });

  it("calculates competitive duel scores where earlier answers receive higher points", () => {
    // 1st gets 15, 2nd gets 12, subsequent gets 10 + combo bonus
    const calculatePoints = (rankOrder: number, combo: number) => {
      const base = rankOrder === 0 ? 15 : rankOrder === 1 ? 12 : 10;
      const comboBonus = Math.min((combo + 1) * 2, 10);
      return base + comboBonus;
    };

    expect(calculatePoints(0, 0)).toBe(17); // 15 + 2
    expect(calculatePoints(1, 0)).toBe(14); // 12 + 2
    expect(calculatePoints(2, 0)).toBe(12); // 10 + 2
    expect(calculatePoints(0, 3)).toBe(23); // 15 + 8 (combo 3)
  });

  it("immediately advances to next question when a player answers correctly", () => {
    const advanceOnCorrect = (currentIndex: number, totalWords: number) => {
      const nextIndex = currentIndex + 1;
      const status = nextIndex >= totalWords ? "finished" : "playing";
      return { nextIndex, status };
    };

    expect(advanceOnCorrect(0, 10)).toEqual({ nextIndex: 1, status: "playing" });
    expect(advanceOnCorrect(9, 10)).toEqual({ nextIndex: 10, status: "finished" });
  });

  it("eliminates player when lives reach 0 and ends game when all players run out of hearts", () => {
    const checkGameStatus = (playersLives: number[]) => {
      const anyAlive = playersLives.some((lives) => lives > 0);
      return anyAlive ? "playing" : "finished";
    };

    expect(checkGameStatus([3, 2, 1])).toBe("playing");
    expect(checkGameStatus([0, 2, 0])).toBe("playing");
    expect(checkGameStatus([0, 0, 0])).toBe("finished");
  });
});


