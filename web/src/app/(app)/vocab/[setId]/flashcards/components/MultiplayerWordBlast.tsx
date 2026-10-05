"use client";

import React, { useEffect, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import {
  blastOptions,
  createFloatingTargets,
  tickFloatingTarget,
  type FloatingTarget,
} from "@/lib/vocab-arcade";
import { MultiplayerScoreboard } from "./MultiplayerScoreboard";
import { MultiplayerCountdown } from "./MultiplayerCountdown";
import styles from "../vocabulary.module.css";
import { getClientDb } from "@/lib/firebase/client";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore/collections";

interface GamePlayer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isHost: boolean;
  score: number;
  lives: number;
  combo: number;
  status: "waiting" | "playing" | "eliminated" | "finished";
}

interface GameRoomData {
  code: string;
  hostId: string;
  gameMode: "blast" | "rain";
  status: "waiting" | "countdown" | "playing" | "finished";
  countdownEndsAt?: number;
  words: VocabWordCard[];
  currentIndex: number;
  roundStartedAt?: number;
  lastWinner?: {
    uid: string;
    displayName: string;
    word: string;
    points: number;
    questionIndex?: number;
    at?: number;
  };
}

interface MultiplayerWordBlastProps {
  roomCode: string;
  initialRoom: GameRoomData;
  initialPlayers: GamePlayer[];
  currentUserId: string;
  muted: boolean;
  onExit: () => void;
  onReturnToLobby?: () => void;
}

/* ---- Web Audio Sound Effects ---- */
function playFailSound() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {}
}

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {}
}

/* Pseudo-random generator with seed so all players see identical target layouts */
function pseudoRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function getAngleToTarget(targetXPercent: number, targetYPercent: number, fieldEl: HTMLDivElement | null): number {
  if (!fieldEl) return 0;
  const width = fieldEl.clientWidth || 800;
  const height = fieldEl.clientHeight || 350;
  const cannonCenterX = width / 2;
  const cannonBottomY = height - 25;
  const targetPixelX = (targetXPercent / 100) * width;
  const targetPixelY = (targetYPercent / 100) * height;
  return (Math.atan2(targetPixelX - cannonCenterX, cannonBottomY - targetPixelY) * 180) / Math.PI;
}

export function MultiplayerWordBlast({
  roomCode,
  initialRoom,
  initialPlayers,
  currentUserId,
  muted,
  onExit,
  onReturnToLobby,
}: MultiplayerWordBlastProps) {
  const [room, setRoom] = useState<GameRoomData>(() => ({
    ...initialRoom,
    status:
      initialRoom.status === "finished"
        ? "finished"
        : initialRoom.status === "countdown"
        ? "countdown"
        : "playing",
  }));
  const [players, setPlayers] = useState<GamePlayer[]>(initialPlayers);
  const [soundQuiet, setSoundQuiet] = useState(muted);
  const [disabledOptions, setDisabledOptions] = useState<number[]>([]);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "correct" | "wrong" } | null>(null);

  // Authoritative displayed index and winner celebration state
  const [displayedIndex, setDisplayedIndex] = useState(initialRoom?.currentIndex ?? 0);
  const [prevDisplayedIndex, setPrevDisplayedIndex] = useState(displayedIndex);
  const [roundWinner, setRoundWinner] = useState<{
    uid: string;
    displayName: string;
    word: string;
    points: number;
    questionIndex: number;
    isMe: boolean;
  } | null>(null);
  const lastProcessedWinnerAt = useRef<number>(Date.now());
  const winnerTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (winnerTimerRef.current) clearTimeout(winnerTimerRef.current);
    };
  }, []);

  // Cannon & Sliding Reticle States
  const [aim, setAim] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [hoveredOptionId, setHoveredOptionId] = useState<number | null>(null);
  const [reticlePos, setReticlePos] = useState<{ x: number; y: number }>({ x: 50, y: 40 });
  const [reticleActive, setReticleActive] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);

  // Dedicated permanent finalization state to prevent result screen flashing or reverting
  const [finalized, setFinalized] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleBackToLobby = async () => {
    setIsResetting(true);
    try {
      await fetch("/api/vocab/game-room/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      });
      onReturnToLobby?.();
    } catch {
      onReturnToLobby?.();
    } finally {
      setIsResetting(false);
    }
  };

  const [myUid, setMyUid] = useState<string>(currentUserId);

  useEffect(() => {
    if (currentUserId && currentUserId !== myUid) {
      setMyUid(currentUserId);
    }
  }, [currentUserId, myUid]);

  useEffect(() => {
    fetch("/api/app/session")
      .then((r) => r.json())
      .then((d) => {
        if (d?.data?.user?.uid) {
          setMyUid(d.data.user.uid);
        }
      })
      .catch(() => {});
  }, []);

  // Synchronize room words if updated by parent (e.g. host start response with shuffled words)
  useEffect(() => {
    if (initialRoom?.words?.length) {
      setRoom((prev) => {
        if (
          !prev.words?.length ||
          prev.words.length !== initialRoom.words.length ||
          prev.words[0]?.id !== initialRoom.words[0]?.id
        ) {
          return { ...prev, words: initialRoom.words };
        }
        return prev;
      });
    }
  }, [initialRoom?.words]);

  // When all players run out of hearts or room ends, finalize permanently
  const allEliminated = players.length >= 1 && players.every((p) => (p.lives ?? 3) <= 0);
  const isFinished = finalized || (!roundWinner && room.status === "finished") || allEliminated;

  const isCountdown =
    room.status === "countdown" &&
    Boolean(room.countdownEndsAt) &&
    Date.now() < (room.countdownEndsAt || 0);

  useEffect(() => {
    if (isFinished && !finalized) {
      setFinalized(true);
      setRoom((prev) => ({ ...prev, status: "finished" }));
    }
  }, [isFinished, finalized]);

  const QUESTION_DURATION = 14; // 14 seconds per question
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION);

  // Real-time listener via Server-Sent Events (SSE), Firestore, and fast fallback polling
  useEffect(() => {
    const handleRoomUpdate = (data: GameRoomData) => {
      if (data.status === "waiting") {
        onReturnToLobby?.();
        return;
      }
      setRoom((prev) => {
        if (prev.status === "finished") return prev;
        if (data.status === "finished") return { ...prev, ...data, status: "finished" };

        const wordsDiffer =
          Boolean(data.words?.length) &&
          (!prev.words?.length ||
            prev.words.length !== data.words.length ||
            prev.words[0]?.id !== data.words[0]?.id);

        const lastWinnerChanged =
          Boolean(data.lastWinner?.at) && data.lastWinner?.at !== prev.lastWinner?.at;

        if (
          !wordsDiffer &&
          !lastWinnerChanged &&
          prev.status === data.status &&
          prev.currentIndex === data.currentIndex &&
          prev.roundStartedAt === data.roundStartedAt &&
          prev.countdownEndsAt === data.countdownEndsAt
        ) {
          return prev;
        }
        return { ...prev, ...data };
      });
    };

    const handlePlayersUpdate = (list: GamePlayer[]) => {
      if (!list || list.length === 0) return;
      setPlayers((prev) => {
        if (prev.length === list.length) {
          const identical = prev.every((p, i) => {
            const n = list[i];
            return (
              p.uid === n.uid &&
              p.score === n.score &&
              p.lives === n.lives &&
              p.status === n.status &&
              p.combo === n.combo
            );
          });
          if (identical) return prev;
        }
        return list;
      });
    };

    // 1. Server-Sent Events (SSE) for instant, sub-50ms push updates
    let eventSource: EventSource | null = null;
    if (typeof window !== "undefined" && "EventSource" in window) {
      try {
        eventSource = new EventSource(`/api/vocab/game-room/events?code=${roomCode}`);
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "room" && data.room) {
              handleRoomUpdate(data.room as GameRoomData);
            } else if (data.type === "players" && data.players) {
              handlePlayersUpdate(data.players as GamePlayer[]);
            }
          } catch {}
        };
      } catch {}
    }

    // 2. Client Firestore SDK listener (if credentials present)
    let unsubRoom: (() => void) | null = null;
    let unsubPlayers: (() => void) | null = null;
    try {
      const db = getClientDb();
      const roomRef = doc(db, COLLECTIONS.gameRooms, roomCode);
      const playersRef = collection(db, COLLECTIONS.gameRooms, roomCode, "players");

      unsubRoom = onSnapshot(
        roomRef,
        (snap) => {
          if (snap.exists()) {
            handleRoomUpdate(snap.data() as GameRoomData);
          }
        },
        () => {},
      );

      unsubPlayers = onSnapshot(
        playersRef,
        (snap) => {
          const list: GamePlayer[] = [];
          snap.forEach((d) => list.push(d.data() as GamePlayer));
          handlePlayersUpdate(list);
        },
        () => {},
      );
    } catch {}

    // 3. Fast polling fallback: every 350ms during active game, 1500ms when finished
    const pollIntervalMs = isFinished ? 1500 : 350;
    const pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/vocab/game-room?code=${roomCode}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.room) {
            handleRoomUpdate(json.data.room as GameRoomData);
          }
          if (json.data.players) {
            handlePlayersUpdate(json.data.players as GamePlayer[]);
          }
          if (json.data.currentUserId) {
            setMyUid((prev) => prev || json.data.currentUserId);
          }
        }
      } catch {}
    }, pollIntervalMs);

    return () => {
      if (eventSource) eventSource.close();
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
      window.clearInterval(pollTimer);
    };
  }, [roomCode, onReturnToLobby, isFinished]);

  // Current question data based on authoritative displayedIndex
  const currentWord = room.words?.[displayedIndex];

  // Options for current question (deterministically seeded)
  const currentOptions = React.useMemo(() => {
    if (!currentWord || !room.words?.length) return [];
    const seed =
      roomCode.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) + displayedIndex * 997;
    const rng = pseudoRandom(seed);
    return blastOptions(currentWord, room.words, rng);
  }, [room.words, displayedIndex, currentWord, roomCode]);

  const [floats, setFloats] = useState<FloatingTarget[]>(() =>
    createFloatingTargets(currentOptions.length || 4)
  );

  // Identify current player accurately
  const currentPlayer =
    players.find((p) => p.uid === myUid) ||
    players.find((p) => p.uid === currentUserId) ||
    null;

  const isEliminated = Boolean(currentPlayer && (currentPlayer.lives ?? 3) <= 0);

  // Synchronously adjust round states when displayed question index changes
  if (prevDisplayedIndex !== displayedIndex) {
    setPrevDisplayedIndex(displayedIndex);
    setTimeLeft(QUESTION_DURATION);
    setHasAnswered(false);
    setDisabledOptions([]);
    setShot(null);
    setHoveredOptionId(null);
    setReticleActive(false);
    setFeedback(null);
    setFloats(createFloatingTargets(currentOptions.length || 4));
  }

  // Unified question progression and winner celebration synchronization
  useEffect(() => {
    // If winner celebration is already active, do not interrupt; it will transition when timer ends
    if (roundWinner) return;

    const lw = room.lastWinner;
    const isNewWinner =
      Boolean(lw?.at) &&
      lw!.at! > lastProcessedWinnerAt.current &&
      (typeof lw!.questionIndex !== "number" || lw!.questionIndex === displayedIndex);

    if (isNewWinner && lw) {
      lastProcessedWinnerAt.current = lw.at!;
      const isMe = lw.uid === myUid || lw.uid === currentUserId;

      setRoundWinner({
        uid: lw.uid,
        displayName: lw.displayName || "Đối thủ",
        word: lw.word,
        points: lw.points || 15,
        questionIndex: displayedIndex,
        isMe,
      });
      setHasAnswered(true);

      if (isMe) {
        if (!soundQuiet) playSuccessSound();
      } else {
        if (!soundQuiet) playFailSound();
        // Opponent won: aim cannon and reticle at opponent's winning word in CURRENT question options
        const winOpt = currentOptions.find(
          (o) => o.word.toLowerCase() === lw.word.toLowerCase()
        );
        if (winOpt) {
          const winIdx = currentOptions.indexOf(winOpt);
          const winFloat = floats[winIdx];
          setShot(winOpt.id);
          if (winFloat && fieldRef.current) {
            setReticlePos({ x: winFloat.x, y: winFloat.y });
            setReticleActive(true);
            setAim(getAngleToTarget(winFloat.x, winFloat.y, fieldRef.current));
          }
        }
      }

      // Keep current question on screen for 1600ms so both players clearly see who grabbed it
      if (winnerTimerRef.current) clearTimeout(winnerTimerRef.current);
      winnerTimerRef.current = setTimeout(() => {
        setRoundWinner(null);
        setDisplayedIndex((prev) => {
          const next =
            typeof room.currentIndex === "number" && room.currentIndex > prev
              ? room.currentIndex
              : prev + 1;
          return next;
        });
        setHasAnswered(false);
        setDisabledOptions([]);
        setShot(null);
        setHoveredOptionId(null);
        setReticleActive(false);
        setFeedback(null);
        setTimeLeft(QUESTION_DURATION);
      }, 1600);

      return;
    }

    // Advance question if server advanced currentIndex without any winner (e.g. timeout)
    if (typeof room.currentIndex === "number" && room.currentIndex > displayedIndex) {
      setDisplayedIndex(room.currentIndex);
      setHasAnswered(false);
      setDisabledOptions([]);
      setShot(null);
      setHoveredOptionId(null);
      setReticleActive(false);
      setFeedback(null);
      setTimeLeft(QUESTION_DURATION);
    }
  }, [
    room.lastWinner,
    room.currentIndex,
    roundWinner,
    displayedIndex,
    myUid,
    currentUserId,
    soundQuiet,
    currentOptions,
    floats,
  ]);

  // Timer countdown: 14s per question with server round synchronization
  useEffect(() => {
    if (isFinished || isCountdown || Boolean(roundWinner)) return;

    if (room.roundStartedAt && room.roundStartedAt > 0) {
      const elapsed = Math.floor((Date.now() - room.roundStartedAt) / 1000);
      const remaining = Math.max(0, QUESTION_DURATION - elapsed);
      setTimeLeft(remaining);
    }

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          fetch("/api/vocab/game-room/next", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: roomCode, questionIndex: displayedIndex }),
          })
            .then(async (res) => {
              const json = await res.json();
              if (json.success && json.data) {
                if (typeof json.data.currentIndex === "number") {
                  setRoom((prevRoom) => ({
                    ...prevRoom,
                    currentIndex: json.data.currentIndex,
                    status: json.data.status || prevRoom.status,
                    roundStartedAt: json.data.roundStartedAt || Date.now(),
                  }));
                }
              }
            })
            .catch(() => {});
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [displayedIndex, isFinished, isCountdown, roundWinner, roomCode, room.roundStartedAt]);

  // Floating animation loop
  useEffect(() => {
    if (isFinished || isEliminated || isCountdown) return;

    let rafId: number;
    let lastTime = performance.now();

    function animate(now: number) {
      const delta = Math.min(now - lastTime, 200);
      lastTime = now;
      setFloats((prev) => prev.map((f) => tickFloatingTarget(f, delta)));
      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [displayedIndex, isFinished, isEliminated, isCountdown]);

  // Handle answering - KHÔNG NHẢY TỰ DO, HIỂN THỊ KẾT QUẢ CÂU HIỆN TẠI, ĐỒNG BỘ TOÀN DIỆN
  const handleSelectOption = async (option: VocabWordCard) => {
    if (isEliminated || hasAnswered || isFinished || isCountdown || Boolean(roundWinner)) return;
    if (!currentPlayer) return;
    if (disabledOptions.includes(option.id)) return;

    const isCorrect = option.id === currentWord?.id;

    if (isCorrect) {
      setHasAnswered(true);
      if (!soundQuiet) {
        playSuccessSound();
      }

      const pointsEarned = 15 + Math.min(((currentPlayer.combo || 0) + 1) * 2, 10);

      // Cập nhật điểm ngay tức thì trên giao diện bản thân
      setPlayers((prev) =>
        prev.map((p) =>
          p.uid === currentPlayer.uid
            ? { ...p, score: (p.score || 0) + pointsEarned, combo: (p.combo || 0) + 1 }
            : p
        )
      );

      // Hiển thị ngay kết quả giành câu hỏi cho chính mình ở câu hiện tại
      lastProcessedWinnerAt.current = Date.now();
      setRoundWinner({
        uid: currentPlayer.uid,
        displayName: currentPlayer.displayName || "Bạn",
        word: option.word,
        points: pointsEarned,
        questionIndex: displayedIndex,
        isMe: true,
      });

      // Bắt đầu đếm 1.6s giữ câu hiện tại, sau đó mới chuyển sang câu tiếp theo
      if (winnerTimerRef.current) clearTimeout(winnerTimerRef.current);
      winnerTimerRef.current = setTimeout(() => {
        setRoundWinner(null);
        setDisplayedIndex((prev) => prev + 1);
        setHasAnswered(false);
        setDisabledOptions([]);
        setShot(null);
        setHoveredOptionId(null);
        setReticleActive(false);
        setFeedback(null);
        setTimeLeft(QUESTION_DURATION);
      }, 1600);

      // Gửi server trong nền, server cập nhật Firestore và SSE broadcast cho đối thủ
      fetch("/api/vocab/game-room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: roomCode,
          questionIndex: displayedIndex,
          correct: true,
          selected: option.word,
        }),
      })
        .then(async (res) => {
          const json = await res.json();
          if (json.success && json.data) {
            if (json.data.status === "finished") {
              setFinalized(true);
              setRoom((prev) => ({ ...prev, status: "finished" }));
            }
          }
        })
        .catch(() => {});
    } else {
      // Wrong choice: deduct 1 heart
      const currentLives = currentPlayer.lives ?? 3;
      const newLives = Math.max(0, currentLives - 1);

      setDisabledOptions((prev) => (prev.includes(option.id) ? prev : [...prev, option.id]));

      setPlayers((prev) =>
        prev.map((p) => (p.uid === currentPlayer.uid ? { ...p, lives: newLives, combo: 0 } : p))
      );

      if (newLives <= 0) {
        setHasAnswered(true);
        setFeedback({
          message: "💀 BẠN ĐÃ HẾT TIM! Màn chọn đã bị khóa. Hãy quan sát trận đấu.",
          tone: "wrong",
        });
      } else {
        setFeedback({
          message: `❌ Sai rồi! -1 tim (Còn ${newLives}❤️)`,
          tone: "wrong",
        });
        window.setTimeout(() => setFeedback(null), 1200);
      }

      if (!soundQuiet) {
        playFailSound();
      }

      fetch("/api/vocab/game-room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: roomCode,
          questionIndex: displayedIndex,
          correct: false,
          selected: option.word,
        }),
      })
        .then(async (res) => {
          const json = await res.json();
          if (json?.data?.status === "finished") {
            setFinalized(true);
            setRoom((prev) => ({ ...prev, status: "finished" }));
          }
        })
        .catch(() => {});
    }
  };

  // Keyboard shortcut listener for numbers 1 to 4
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEliminated || hasAnswered || isFinished || isCountdown || Boolean(roundWinner)) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= currentOptions.length) {
        const opt = currentOptions[num - 1];
        if (opt && !disabledOptions.includes(opt.id)) {
          const f = floats[num - 1];
          setShot(opt.id);
          if (f) {
            setReticlePos({ x: f.x, y: f.y });
            setReticleActive(true);
            if (fieldRef.current) {
              setAim(getAngleToTarget(f.x, f.y, fieldRef.current));
            }
          }
          handleSelectOption(opt);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentOptions, disabledOptions, floats, hasAnswered, isCountdown, isEliminated, isFinished, roundWinner]);

  // RENDER: 5-Second Countdown Screen
  if (isCountdown && room.countdownEndsAt) {
    return (
      <MultiplayerCountdown
        countdownEndsAt={room.countdownEndsAt}
        gameMode="blast"
        roomCode={roomCode}
        players={players}
        currentUserId={myUid || currentUserId}
        muted={soundQuiet}
        onFinish={() => {
          setRoom((prev) => ({ ...prev, status: "playing" }));
        }}
      />
    );
  }

  // RENDER: Game Over / Finished Screen
  if (isFinished) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    return (
      <div className="relative min-h-[580px] flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl">
        <div className="w-full max-w-xl mx-auto py-6">
          <div className="text-6xl mb-3 animate-bounce">🏆</div>
          <h2 className="text-3xl font-black text-[var(--ink)] mb-2 tracking-wide uppercase">
            TỔNG KẾT TRẬN ĐẤU!
          </h2>
          <p className="text-[var(--muted)] mb-8 font-medium">
            {allEliminated
              ? "Toàn bộ người chơi đã hết tim — Trận đấu kết thúc!"
              : `Phòng: ${roomCode} · Hoàn thành ${room.words.length} câu hỏi`}
          </p>

          {/* Winner banner */}
          {winner && (
            <div className="bg-gradient-to-r from-amber-500/15 via-amber-400/25 to-amber-500/15 border-2 border-amber-400/50 rounded-2xl p-6 mb-8 shadow-lg">
              <div className="text-xs uppercase tracking-widest font-black text-amber-400 mb-1">
                👑 Người chiến thắng
              </div>
              <div className="text-2xl font-black text-[var(--ink)]">{winner.displayName}</div>
              <div className="text-4xl font-black font-mono text-amber-400 mt-2">
                {winner.score} <span className="text-lg font-medium text-[var(--ink2)]">điểm</span>
              </div>
            </div>
          )}

          {/* Leaderboard Table */}
          <div className="flex flex-col gap-3 mb-8">
            {sorted.map((p, idx) => {
              const medals = ["🥇", "🥈", "🥉"];
              const isMe = p.uid === (myUid || currentUserId);
              return (
                <div
                  key={p.uid}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                    isMe
                      ? "border-amber-400 bg-amber-400/10 font-bold ring-2 ring-amber-400/30 text-[var(--ink)] shadow-md"
                      : "border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl w-8 text-center">{medals[idx] || `#${idx + 1}`}</span>
                    <div className="text-left">
                      <div className="font-bold flex items-center gap-2">
                        <span>{p.displayName}</span>
                        {isMe && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                            Bạn
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted)] font-medium">
                        {p.lives > 0 ? `Còn ${p.lives} ❤️` : "Hết mạng 💀"}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono font-black text-xl text-amber-400">{p.score} điểm</div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={isResetting}
              onClick={handleBackToLobby}
              className="flex-1 py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-black rounded-xl shadow-lg transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
            >
              <span>{isResetting ? "⏳" : "🔄"}</span>
              <span>{isResetting ? "Đang trở lại phòng..." : "Quay lại phòng chơi tiếp"}</span>
            </button>
            <button
              type="button"
              onClick={onExit}
              className="flex-1 py-4 bg-[var(--surface-soft)] hover:bg-[var(--line)] text-[var(--ink)] font-bold rounded-xl border border-[var(--line)] shadow transition-all cursor-pointer active:scale-98 flex items-center justify-center gap-2"
            >
              <span>🚪</span>
              <span>Rời phòng</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hoveredIndex =
    hoveredOptionId !== null
      ? currentOptions.findIndex((opt) => opt.id === hoveredOptionId)
      : -1;
  const hoveredFloat = hoveredIndex >= 0 ? floats[hoveredIndex] : null;

  return (
    <section className={`${styles.arcadeRound} relative min-h-[640px]`} aria-label="Word Blast Đối Kháng">
      {/* Realtime Scoreboard in corner */}
      <MultiplayerScoreboard players={players} currentUserId={myUid || currentUserId} />

      {/* Top Header */}
      <header className={styles.toolbar}>
        <div>
          <span className={styles.eyebrow}>
            ĐỐI KHÁNG TRỰC TIẾP · PHÒNG #{roomCode}
          </span>
          <h2 className="text-xl font-bold text-[var(--ink)]">Word Blast — Đấu Trí</h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={styles.button}
            onClick={() => setSoundQuiet(!soundQuiet)}
          >
            {soundQuiet ? "Bật âm thanh" : "Tắt âm thanh"}
          </button>
          <button type="button" className={styles.button} onClick={onExit}>
            Rời phòng
          </button>
        </div>
      </header>

      {/* Main Arcade Area */}
      <div className={`${styles.arcade} ${styles.blastArena}`}>
        {/* Scoreboard bar */}
        <div className={styles.scoreboard}>
          <span className={styles.hearts} aria-label={`Còn ${currentPlayer?.lives ?? 0} mạng`}>
            {"❤️".repeat(Math.max(0, currentPlayer?.lives ?? 0))}
            <span>{"🤍".repeat(Math.max(0, 3 - Math.max(0, currentPlayer?.lives ?? 0)))}</span>
          </span>
          <span className="font-bold">
            Câu {displayedIndex + 1}/{room.words.length}
          </span>
          <span className="font-mono font-bold text-amber-400">
            ⏳ {timeLeft}s
          </span>
          <strong>{currentPlayer?.score ?? 0} điểm</strong>
        </div>

        {/* Vietnamese Meaning Clue & Winner Announcement */}
        {roundWinner ? (
          <div
            className={`w-full max-w-xl mx-auto p-4 rounded-2xl border-2 shadow-xl transition-all duration-300 animate-in zoom-in-95 ${
              roundWinner.isMe
                ? "bg-gradient-to-r from-emerald-950/80 via-emerald-900/90 to-emerald-950/80 border-emerald-400 text-emerald-200 shadow-emerald-500/20"
                : "bg-gradient-to-r from-amber-950/80 via-amber-900/90 to-amber-950/80 border-amber-400 text-amber-200 shadow-amber-500/20"
            }`}
          >
            <div className="flex items-center justify-center gap-2 text-base sm:text-lg font-black tracking-wider uppercase">
              <span className="text-xl animate-bounce">{roundWinner.isMe ? "🎯" : "⚡"}</span>
              <span>
                {roundWinner.isMe
                  ? `BẠN ĐÃ BẮN TRÚNG! (+${roundWinner.points} ĐIỂM)`
                  : `${roundWinner.displayName.toUpperCase()} ĐÃ GIÀNH ĐƯỢC CÂU NÀY! (+${roundWinner.points} ĐIỂM)`}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-semibold opacity-90 mt-1 text-center">
              {roundWinner.isMe
                ? `Bạn đã nhanh tay bắn đúng từ "${roundWinner.word}"`
                : `${roundWinner.displayName} đã nhanh tay bắn đúng từ "${roundWinner.word}"`}
            </p>
          </div>
        ) : (
          <div className={styles.blastClue}>
            <p>&gt; TÌM TỪ TIẾNG ANH TƯƠNG ỨNG</p>
            <h3 className="text-2xl sm:text-3xl font-extrabold max-w-xl mx-auto">
              &ldquo;{currentWord?.meaning}&rdquo;
            </h3>
            <small>
              {feedback
                ? feedback.message
                : `Còn ${timeLeft} giây · Người bấm đúng đầu tiên sẽ cướp điểm!`}
            </small>
          </div>
        )}

        {/* Field with Cannon, Laser Guide, Sliding Reticle, Targets */}
        <div
          ref={fieldRef}
          className={styles.field}
          data-paused={isFinished || isEliminated}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const mouseX = event.clientX - bounds.left;
            const mouseY = event.clientY - bounds.top;
            const cannonCenterX = bounds.width / 2;
            const cannonBottomY = bounds.height - 25;
            const mouseXPercent = (mouseX / bounds.width) * 100;
            const mouseYPercent = (mouseY / bounds.height) * 100;

            if (hoveredOptionId === null) {
              setAim((Math.atan2(mouseX - cannonCenterX, cannonBottomY - mouseY) * 180) / Math.PI);
              setReticlePos({ x: mouseXPercent, y: mouseYPercent });
              setReticleActive(true);
            }
          }}
          onPointerLeave={() => {
            if (hoveredOptionId === null) {
              setReticleActive(false);
            }
          }}
        >
          {isEliminated ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-red-950/20 backdrop-blur-sm z-20">
              <div className="text-5xl mb-2 animate-bounce">💀</div>
              <h3 className="text-xl font-black text-red-500 mb-1 uppercase tracking-wide">
                BẠN ĐÃ HẾT TIM & BỊ LOẠI!
              </h3>
              <p className="text-xs font-semibold text-[var(--ink2)] max-w-md mb-3">
                Màn chọn của bạn đã bị khóa. Hãy quan sát các đối thủ còn lại tiếp tục đấu trí nhé!
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-1 bg-[var(--surface)] border border-[var(--line)] rounded-full text-xs font-bold text-[var(--ink)]">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Đang thi đấu:</span>
                {players.filter((p) => (p.lives ?? 3) > 0).map((p) => (
                  <span key={p.uid} className="text-blue-400">
                    {p.displayName} ({p.lives}❤️)
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              {currentOptions.map((opt, i) => {
                const pos = floats[i] || { x: 25 * ((i % 4) + 1) - 10, y: 35 };
                const isHovered = hoveredOptionId === opt.id;
                const isWrongChoice = disabledOptions.includes(opt.id);
                const isWinningWord =
                  Boolean(roundWinner) &&
                  opt.word.toLowerCase() === roundWinner?.word.toLowerCase();
                const isCorrectAnswer =
                  isWinningWord || (hasAnswered && opt.id === currentWord?.id);
                const isDisabled =
                  Boolean(roundWinner) || isWrongChoice || (hasAnswered && !isCorrectAnswer);

                return (
                  <button
                    key={`${displayedIndex}-${opt.id}`}
                    type="button"
                    data-nth={(i % 4) + 1}
                    data-hit={
                      shot === opt.id || isWinningWord
                        ? isCorrectAnswer
                          ? "correct"
                          : isWrongChoice
                          ? "wrong"
                          : undefined
                        : undefined
                    }
                    data-targeted={isHovered ? "true" : undefined}
                    className={`${styles.floatingTarget} ${
                      isWrongChoice ? styles.floatingTargetWrong : ""
                    } ${isCorrectAnswer ? styles.floatingTargetCorrect : ""} ${
                      isWinningWord
                        ? "ring-4 ring-emerald-400 border-emerald-400 bg-emerald-500/25 shadow-[0_0_25px_rgba(16,185,129,0.7)]"
                        : ""
                    }`}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      opacity: isWrongChoice ? 0.3 : isDisabled && !isWinningWord ? 0.4 : 1,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                    }}
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      setShot(opt.id);
                      setReticlePos({ x: pos.x, y: pos.y });
                      setReticleActive(true);
                      if (pos && fieldRef.current) {
                        setAim(getAngleToTarget(pos.x, pos.y, fieldRef.current));
                      }
                      handleSelectOption(opt);
                    }}
                    onPointerEnter={() => {
                      if (!isDisabled && !isEliminated) {
                        setHoveredOptionId(opt.id);
                        setReticlePos({ x: pos.x, y: pos.y });
                        setReticleActive(true);
                        if (pos && fieldRef.current) {
                          setAim(getAngleToTarget(pos.x, pos.y, fieldRef.current));
                        }
                      }
                    }}
                    onPointerLeave={() => {
                      setHoveredOptionId((prev) => (prev === opt.id ? null : prev));
                    }}
                  >
                    <kbd>{i + 1}</kbd> {opt.word}
                    {isWinningWord && roundWinner && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 px-2 py-0.5 text-xs font-black rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/50">
                        👑 {roundWinner.displayName} (+{roundWinner.points}đ)
                      </span>
                    )}
                    {(shot === opt.id || isWinningWord) && (
                      <span className={styles.hitBurst} aria-hidden="true">
                        {isCorrectAnswer ? "✦" : "×"}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* Dynamic Sliding Crosshair Reticle */}
          {reticlePos && !isEliminated && !isFinished && (
            <div
              className={styles.slidingReticle}
              style={{
                left: `${reticlePos.x}%`,
                top: `${reticlePos.y}%`,
                opacity: reticleActive ? 1 : 0,
                transform: `translate(-50%, -50%) scale(${hoveredOptionId !== null ? 1.25 : 1})`,
              }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 40 40" fill="none">
                <path d="M6 14V6H14" stroke="#5cd9ff" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M26 6H34V14" stroke="#5cd9ff" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M34 26V34H26" stroke="#5cd9ff" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M14 34H6V26" stroke="#5cd9ff" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="7" stroke="#5cd9ff" strokeWidth="1.5" />
                <line x1="20" y1="9" x2="20" y2="15" stroke="#5cd9ff" strokeWidth="1.5" />
                <line x1="20" y1="25" x2="20" y2="31" stroke="#5cd9ff" strokeWidth="1.5" />
                <line x1="9" y1="20" x2="15" y2="20" stroke="#5cd9ff" strokeWidth="1.5" />
                <line x1="25" y1="20" x2="31" y2="20" stroke="#5cd9ff" strokeWidth="1.5" />
                <circle cx="20" cy="20" r="2" fill="#5cd9ff" />
              </svg>
            </div>
          )}

          {/* Aim Laser Guide */}
          {hoveredFloat && !isEliminated && !isFinished && (
            <svg className={styles.aimGuideOverlay} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
              <line
                x1="500"
                y1="870"
                x2={hoveredFloat.x * 10}
                y2={hoveredFloat.y * 10}
                className={styles.aimLaserGuide}
              />
            </svg>
          )}

          {/* Ground */}
          <div className={styles.ground} />

          {/* Cannon Turret */}
          <div className={styles.cannon} data-aiming={hoveredOptionId !== null ? "true" : undefined} aria-hidden="true">
            <svg viewBox="0 0 100 100">
              <g style={{ transform: `rotate(${aim}deg)`, transformOrigin: "50px 75px" }}>
                <path d="M40 70V20Q50 10 60 20V70Z" />
                <path d="M43 25H57M43 35H57" />
                <ellipse cx="50" cy="20" rx="10" ry="4" className={styles.cannonMuzzle} />
              </g>
              <path d="M25 85Q25 60 50 60Q75 60 75 85Z" />
              <ellipse cx="50" cy="85" rx="36" ry="8" />
            </svg>
          </div>

          {/* Shot Beam Animation */}
          {shot !== null && (
            <div key={`shot-${shot}-${displayedIndex}`} className={styles.shotBeam} style={{ rotate: `${aim}deg` }} aria-hidden="true" />
          )}
        </div>
      </div>

      {/* Helper text */}
      <footer className="text-center text-xs text-[var(--muted)]">
        {isEliminated
          ? "Bạn đang ở chế độ quan sát trận đấu."
          : "Phím tắt 1 - 4 tương ứng với từng đáp án bay lơ lửng. Người nhắm bắn đúng đầu tiên sẽ cướp được điểm!"}
      </footer>
    </section>
  );
}
