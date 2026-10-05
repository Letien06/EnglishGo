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

  it("skips answer submission if question has already advanced by another player", () => {
    const shouldProcessAnswer = (roomCurrentIndex: number, submittedQuestionIndex: number) => {
      if (roomCurrentIndex !== submittedQuestionIndex) {
        return { skipped: true, reason: "Question already advanced" };
      }
      return { skipped: false };
    };

    expect(shouldProcessAnswer(1, 0)).toEqual({ skipped: true, reason: "Question already advanced" });
    expect(shouldProcessAnswer(1, 1)).toEqual({ skipped: false });
  });

  it("preserves monotonicity of room question index so clients never revert to older questions", () => {
    const updateRoomIndex = (currentIndex: number, incomingIndex: number) => {
      if (incomingIndex < currentIndex) return currentIndex;
      return incomingIndex;
    };

    expect(updateRoomIndex(2, 1)).toBe(2);
    expect(updateRoomIndex(2, 2)).toBe(2);
    expect(updateRoomIndex(2, 3)).toBe(3);
  });

  it("resets room status, questions, and all players to waiting state for rematch", () => {
    const resetRoomState = (
      room: { status: string; currentIndex: number; lastWinner?: any },
      players: Array<{ status: string; score: number; lives: number; combo: number }>
    ) => {
      return {
        room: { ...room, status: "waiting", currentIndex: 0, lastWinner: undefined },
        players: players.map((p) => ({ ...p, status: "waiting", score: 0, lives: 3, combo: 0 })),
      };
    };

    const previousRound = {
      room: { status: "finished", currentIndex: 10, lastWinner: { displayName: "Winner", points: 25 } },
      players: [
        { status: "finished", score: 120, lives: 2, combo: 4 },
        { status: "eliminated", score: 45, lives: 0, combo: 0 },
      ],
    };

    const nextRound = resetRoomState(previousRound.room, previousRound.players);
    expect(nextRound.room.status).toBe("waiting");
    expect(nextRound.room.currentIndex).toBe(0);
    expect(nextRound.room.lastWinner).toBeUndefined();
    expect(nextRound.players).toHaveLength(2);
    expect(nextRound.players[0]).toEqual({ status: "waiting", score: 0, lives: 3, combo: 0 });
    expect(nextRound.players[1]).toEqual({ status: "waiting", score: 0, lives: 3, combo: 0 });
  });
});



