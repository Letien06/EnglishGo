import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiplayerVocabularyRain } from "./MultiplayerVocabularyRain";

const vocabularyAudio = vi.hoisted(() => ({ speakWord: vi.fn(), stop: vi.fn() }));
vi.mock("../useVocabularyAudio", () => ({ default: () => vocabularyAudio }));

const words = [
  { id: 1, word: "carry", meaning: "mang theo", mastered: false },
  { id: 2, word: "office", meaning: "văn phòng", mastered: false },
];

const mockPlayers = [
  {
    uid: "user-1",
    displayName: "Player 1",
    photoURL: null,
    isHost: true,
    score: 30,
    lives: 3,
    combo: 1,
    status: "playing" as const,
  },
  {
    uid: "user-2",
    displayName: "Player 2",
    photoURL: null,
    isHost: false,
    score: 15,
    lives: 2,
    combo: 0,
    status: "playing" as const,
  },
];

const mockRoom = {
  code: "RAIN99",
  hostId: "user-1",
  gameMode: "rain" as const,
  status: "playing" as const,
  words,
  currentIndex: 0,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MultiplayerVocabularyRain", () => {
  it("renders the falling rain clue with meaning and scoreboard", () => {
    render(
      <MultiplayerVocabularyRain
        roomCode="RAIN99"
        initialRoom={mockRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    expect(screen.getByText("Mưa Từ Vựng — Đua Tốc Độ")).toBeInTheDocument();
    expect(screen.getByText(/PHÒNG #RAIN99/i)).toBeInTheDocument();
    expect(screen.getByText("mang theo")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Gõ từ tiếng Anh tương ứng/)).toBeInTheDocument();
  });

  it("submits correct word when player types matching English word", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/api/vocab/game-room/answer")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MultiplayerVocabularyRain
        roomCode="RAIN99"
        initialRoom={mockRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Gõ từ tiếng Anh tương ứng/);
    fireEvent.change(input, { target: { value: "carry" } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/vocab/game-room/answer",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            code: "RAIN99",
            questionIndex: 0,
            correct: true,
            selected: "carry",
          }),
        })
      );
    });

    expect(screen.getByText(/Chính xác! Bạn đã bắt được từ "carry"!/)).toBeInTheDocument();
  });

  it("locks input and shows elimination spectator screen when player has 0 lives", () => {
    const eliminatedPlayers = [
      { ...mockPlayers[0], lives: 0, status: "eliminated" as const },
      { ...mockPlayers[1], lives: 2 },
    ];

    render(
      <MultiplayerVocabularyRain
        roomCode="RAIN99"
        initialRoom={mockRoom}
        initialPlayers={eliminatedPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
      />
    );

    expect(screen.getByText(/BẠN ĐÃ HẾT TIM & BỊ LOẠI!/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Gõ từ tiếng Anh tương ứng/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Player 2/).length).toBeGreaterThan(0);
  });

  it("renders victory podium and triggers rematch reset when clicking 'Quay lại phòng chơi tiếp'", async () => {
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
      <MultiplayerVocabularyRain
        roomCode="RAIN99"
        initialRoom={finishedRoom}
        initialPlayers={mockPlayers}
        currentUserId="user-1"
        muted={true}
        onExit={vi.fn()}
        onReturnToLobby={onReturnToLobby}
      />
    );

    expect(screen.getByText("TỔNG KẾT MƯA TỪ VỰNG")).toBeInTheDocument();
    expect(screen.getByText(/Quán quân gõ nhanh/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Quay lại phòng chơi tiếp/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rời phòng/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Quay lại phòng chơi tiếp/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/vocab/game-room/reset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ code: "RAIN99" }),
        })
      );
      expect(onReturnToLobby).toHaveBeenCalledTimes(1);
    });
  });
});
