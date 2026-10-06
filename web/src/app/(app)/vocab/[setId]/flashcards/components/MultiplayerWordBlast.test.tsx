import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiplayerWordBlast } from "./MultiplayerWordBlast";

const vocabularyAudio = vi.hoisted(() => ({ speakWord: vi.fn(), stop: vi.fn() }));
vi.mock("../useVocabularyAudio", () => ({ default: () => vocabularyAudio }));

const words = [
  { id: 1, word: "apple", meaning: "quả táo", mastered: false },
  { id: 2, word: "banana", meaning: "quả chuối", mastered: false },
  { id: 3, word: "orange", meaning: "quả cam", mastered: false },
  { id: 4, word: "grape", meaning: "quả nho", mastered: false },
];

const mockPlayers = [
  {
    uid: "user-1",
    displayName: "Player 1",
    photoURL: null,
    isHost: true,
    score: 25,
    lives: 3,
    combo: 1,
    status: "playing" as const,
  },
  {
    uid: "user-2",
    displayName: "Player 2",
    photoURL: null,
    isHost: false,
    score: 10,
    lives: 2,
    combo: 0,
    status: "playing" as const,
  },
];

const mockRoom = {
  code: "BLST99",
  hostId: "user-1",
  gameMode: "blast" as const,
  status: "playing" as const,
  words,
  currentIndex: 0,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MultiplayerWordBlast", () => {
  it("renders cannon, laser ground, and prompt clue", () => {
    render(
      <MultiplayerWordBlast
        roomCode="BLST99"
        initialRoom={mockRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    expect(screen.getByText("Word Blast — Đấu Trí")).toBeInTheDocument();
    expect(screen.getByText(/PHÒNG #BLST99/i)).toBeInTheDocument();
    expect(screen.getByText(/quả táo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apple/i })).toBeInTheDocument();
  });

  it("submits correct answer when clicking target button", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/vocab/game-room/answer")) {
        return new Response(JSON.stringify({ success: true, data: { advanced: true, nextIndex: 1, points: 17 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MultiplayerWordBlast
        roomCode="BLST99"
        initialRoom={mockRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    const targetBtn = screen.getByRole("button", { name: /apple/i });
    fireEvent.click(targetBtn);

    // The winner banner only appears after the server confirms the answer
    // (no optimistic score UI — see BUG-9 fix).
    await waitFor(() => {
      expect(screen.getByText(/BẠN ĐÃ BẮN TRÚNG!/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/vocab/game-room/answer",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            code: "BLST99",
            questionIndex: 0,
            correct: true,
            selected: "apple",
          }),
        })
      );
    });
  });

  it("optimistically restarts the timer when it expires instead of parking at 0s", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/vocab/game-room/next")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { currentIndex: 1, status: "playing", roundStartedAt: Date.now() },
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MultiplayerWordBlast
        roomCode="BLST99"
        initialRoom={mockRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    // 7s countdown ticks down, then the client fires /next at expiry.
    // (No waitFor: testing-library's polling hangs under fake timers.)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7100);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vocab/game-room/next",
      expect.objectContaining({ method: "POST" })
    );

    // Timer must restart at 7s immediately (optimistic reset) rather than
    // sticking at 0s and jumping back up when the server responds.
    expect(screen.getByText("⏳ 7s")).toBeInTheDocument();
  });

  it("renders countdown screen when room is in countdown status", () => {
    const countdownRoom = {
      ...mockRoom,
      status: "countdown" as const,
      countdownEndsAt: Date.now() + 5000,
    };

    render(
      <MultiplayerWordBlast
        roomCode="BLST99"
        initialRoom={countdownRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    expect(screen.getByText(/Máy chủ đang đồng bộ từ vựng & kết nối mọi người chơi/i)).toBeInTheDocument();
    expect(screen.getByText("WORD BLAST")).toBeInTheDocument();
  });

  it("renders result screen and handles rematch when finished", async () => {
    const finishedRoom = {
      ...mockRoom,
      status: "finished" as const,
    };

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/vocab/game-room/reset")) {
        return new Response(JSON.stringify({ success: true, status: "waiting" }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onReturnToLobby = vi.fn();
    render(
      <MultiplayerWordBlast
        roomCode="BLST99"
        initialRoom={finishedRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
        onReturnToLobby={onReturnToLobby}
      />
    );

    expect(screen.getByText(/Tổng kết trận đấu!/i)).toBeInTheDocument();
    expect(screen.getByText(/👑 Người chiến thắng/i)).toBeInTheDocument();

    // BUG-11: the summary must show questions actually played (displayedIndex + 1),
    // not the room total, when a match ends early.
    expect(screen.getByText(/Đã chơi 1\/4 câu/i)).toBeInTheDocument();
    expect(screen.queryByText(/Hoàn thành \d+ câu hỏi/)).not.toBeInTheDocument();

    const rematchBtn = screen.getByRole("button", { name: /Quay lại phòng chơi tiếp/i });
    fireEvent.click(rematchBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/vocab/game-room/reset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "BLST99" }),
        })
      );
    });
  });

  it("synchronizes shuffled words when initialRoom words updates", () => {
    const { rerender } = render(
      <MultiplayerWordBlast
        roomCode="BLST99"
        initialRoom={mockRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    // Initial word is apple (quả táo)
    expect(screen.getByText("“quả táo”")).toBeInTheDocument();

    // Rerender with shuffled words where author (tác giả) is first
    const shuffledWords = [
      { id: 99, word: "author", meaning: "tác giả", mastered: false },
      ...words,
    ];

    rerender(
      <MultiplayerWordBlast
        roomCode="BLST99"
        initialRoom={{ ...mockRoom, words: shuffledWords }}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    expect(screen.getByText("“tác giả”")).toBeInTheDocument();
  });
});

