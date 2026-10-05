"use client";

import React, { useEffect, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import {
  blastOptions,
  createFloatingTargets,
  tickFloatingTarget,
  type FloatingTarget,
} from "@/lib/vocab-arcade";
import useVocabularyAudio from "../useVocabularyAudio";
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

  // Cannon & Reticle Aiming States
  const [aim, setAim] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [hoveredOptionId, setHoveredOptionId] = useState<number | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  // Dedicated locking state for when local player runs out of hearts
  const [isLocalEliminated, setIsLocalEliminated] = useState(false);

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
  const [winnerNotice, setWinnerNotice] = useState<{ displayName: string; points: number } | null>(null);

  useEffect(() => {
    if (currentUserId && currentUserId !== myUid) {
      setMyUid(currentUserId);
    }
  }, [currentUserId]);

  // Ensure myUid is accurately loaded from authenticated session
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

  // When all players run out of hearts or room ends, finalize permanently
  const allEliminated = players.length >= 1 && players.every((p) => (p.lives ?? 3) <= 0);
  const isFinished = finalized || room.status === "finished" || allEliminated;

  const isCountdown =
    room.status === "countdown" ||
    (Boolean(room.countdownEndsAt) && Date.now() < (room.countdownEndsAt || 0));

  useEffect(() => {
    if (isFinished && !finalized) {
      setFinalized(true);
      setRoom((prev) => ({ ...prev, status: "finished" }));
    }
  }, [isFinished, finalized]);

  useEffect(() => {
    if (room.lastWinner) {
      setWinnerNotice({
        displayName: room.lastWinner.displayName,
        points: room.lastWinner.points,
      });
      const timer = window.setTimeout(() => {
        setWinnerNotice(null);
      }, 3500);
      return () => window.clearTimeout(timer);
    }
  }, [room.currentIndex, room.lastWinner?.uid, room.lastWinner?.points]);

  const { speakWord } = useVocabularyAudio();
  const QUESTION_DURATION = 14; // 14 seconds per question
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION);

  // Real-time listener via Firestore with guarded fallback
  useEffect(() => {
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
            const data = snap.data() as GameRoomData;
            if (data.status === "waiting") {
              onReturnToLobby?.();
              return;
            }
            setRoom((prev) => {
              if (prev.status === "finished") return prev;
              if (data.status === "finished") return { ...prev, ...data, status: "finished" };
              if ((data.currentIndex ?? 0) < (prev.currentIndex ?? 0)) return prev;
              // Guard re-renders if no state difference
              if (
                prev.status === data.status &&
                prev.currentIndex === data.currentIndex &&
                prev.lastWinner?.at === data.lastWinner?.at &&
                prev.roundStartedAt === data.roundStartedAt &&
                prev.countdownEndsAt === data.countdownEndsAt
              ) {
                return prev;
              }
              return { ...prev, ...data };
            });
          }
        },
        () => {},
      );

      unsubPlayers = onSnapshot(
        playersRef,
        (snap) => {
          const list: GamePlayer[] = [];
          snap.forEach((d) => list.push(d.data() as GamePlayer));
          if (list.length > 0) {
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
          }
        },
        () => {},
      );
    } catch {}

    // Polling fallback every 2500ms (reduced from 400ms to eliminate stutter)
    const pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/vocab/game-room?code=${roomCode}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.room) {
            if (json.data.room.status === "waiting") {
              onReturnToLobby?.();
              return;
            }
            setRoom((prev) => {
              if (prev.status === "finished") return prev;
              const r = json.data.room;
              if (r.status === "finished") return { ...prev, ...r, status: "finished" };
              if ((r.currentIndex ?? 0) < (prev.currentIndex ?? 0)) return prev;
              if (
                prev.status === r.status &&
                prev.currentIndex === r.currentIndex &&
                prev.lastWinner?.at === r.lastWinner?.at &&
                prev.roundStartedAt === r.roundStartedAt
              ) {
                return prev;
              }
              return { ...prev, ...r };
            });
          }
          if (json.data.players) {
            const list = json.data.players as GamePlayer[];
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
          }
          if (json.data.currentUserId) {
            setMyUid((prev) => prev || json.data.currentUserId);
          }
        }
      } catch {}
    }, 2500);

    return () => {
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
      window.clearInterval(pollTimer);
    };
  }, [roomCode, onReturnToLobby]);

  // Current question data
  const currentIndex = room.currentIndex ?? 0;
  const currentWord = room.words?.[currentIndex];

  // Options for current question (deterministically seeded)
  const currentOptions = React.useMemo(() => {
    if (!currentWord || !room.words?.length) return [];
    const seed =
      roomCode.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) + currentIndex * 997;
    const rng = pseudoRandom(seed);
    return blastOptions(currentWord, room.words, rng);
  }, [room.words, currentIndex, currentWord, roomCode]);

  const [floats, setFloats] = useState<FloatingTarget[]>(() =>
    createFloatingTargets(currentOptions.length || 4)
  );

  // Identify current player accurately
  const currentPlayer =
    players.find((p) => p.uid === myUid) ||
    players.find((p) => p.uid === currentUserId) ||
    null;

  const isEliminated =
    isLocalEliminated || Boolean(currentPlayer && (currentPlayer.lives ?? 3) <= 0);

  // Synchronously adjust round states when question index changes
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  if (prevIndex !== currentIndex) {
    setPrevIndex(currentIndex);
    setTimeLeft(QUESTION_DURATION);
    // ONLY reset answering state if player is still alive in the game!
    if (!isEliminated) {
      setHasAnswered(false);
      setDisabledOptions([]);
      setShot(null);
      setHoveredOptionId(null);
      setFloats(createFloatingTargets(currentOptions.length || 4));
    }
  }

  // Timer countdown
  useEffect(() => {
    if (isFinished || isCountdown) return;

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          const isHost = currentPlayer?.isHost;
          if (isHost || prev <= 0) {
            fetch("/api/vocab/game-room/next", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: roomCode, questionIndex: currentIndex }),
            }).catch(() => {});
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [currentIndex, isFinished, isCountdown, roomCode, currentPlayer?.isHost]);

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
  }, [currentIndex, isFinished, isEliminated, isCountdown]);

  // Handle answering
  const handleSelectOption = async (option: VocabWordCard) => {
    if (isEliminated || hasAnswered || isFinished || isCountdown) return;
    if (!currentPlayer) return;
    if (disabledOptions.includes(option.id)) return;

    const isCorrect = option.id === currentWord?.id;

    if (isCorrect) {
      setHasAnswered(true);
      setFeedback({ message: "CHÍNH XÁC! 🎯 CƯỚP ĐIỂM THÀNH CÔNG!", tone: "correct" });
      const pointsEarned = 15 + Math.min(((currentPlayer.combo || 0) + 1) * 2, 10);
      setPlayers((prev) =>
        prev.map((p) =>
          p.uid === currentPlayer.uid
            ? { ...p, score: (p.score || 0) + pointsEarned, combo: (p.combo || 0) + 1 }
            : p
        )
      );
      if (!soundQuiet && currentWord) {
        playSuccessSound();
        window.setTimeout(() => speakWord(currentWord), 200);
      }
    } else {
      // Wrong choice: deduct 1 heart
      const currentLives = currentPlayer.lives ?? 3;
      const newLives = Math.max(0, currentLives - 1);

      setDisabledOptions((prev) => (prev.includes(option.id) ? prev : [...prev, option.id]));

      setPlayers((prev) =>
        prev.map((p) => (p.uid === currentPlayer.uid ? { ...p, lives: newLives, combo: 0 } : p))
      );

      if (newLives <= 0) {
        setIsLocalEliminated(true);
        setHasAnswered(true);
        setFeedback({
          message: "💀 BẠN ĐÃ HẾT TIM! Màn chọn đã bị khóa. Hãy quan sát trận đấu.",
          tone: "wrong",
        });
      } else {
        setFeedback({
          message: `❌ Sai rồi! -1 tim (Còn ${newLives}❤️). Hãy chọn lại đáp án khác!`,
          tone: "wrong",
        });
      }

      if (!soundQuiet) {
        playFailSound();
      }
    }

    try {
      const res = await fetch("/api/vocab/game-room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: roomCode,
          questionIndex: currentIndex,
          correct: isCorrect,
          selected: option.word,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.advanced || (json.data.nextIndex !== undefined && json.data.nextIndex !== currentIndex)) {
          setRoom((prev) => ({
            ...prev,
            currentIndex: json.data.nextIndex,
            status: json.data.status || prev.status,
            lastWinner: json.data.lastWinner || prev.lastWinner,
          }));
        }
        if (json.data.status === "finished") {
          setFinalized(true);
          setRoom((prev) => ({ ...prev, status: "finished" }));
        }
      }
    } catch {}
  };

  // Keyboard shortcut listener for numbers 1 to 4
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEliminated || hasAnswered || isFinished || isCountdown) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= currentOptions.length) {
        const opt = currentOptions[num - 1];
        if (opt && !disabledOptions.includes(opt.id)) {
          const f = floats[num - 1];
          setShot(opt.id);
          if (f && fieldRef.current) {
            setAim(getAngleToTarget(f.x, f.y, fieldRef.current));
          }
          handleSelectOption(opt);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentOptions, disabledOptions, floats, hasAnswered, isCountdown, isEliminated, isFinished]);

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
            Tổng kết trận đấu!
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
                  <div className="font-mono font-black text-xl text-amber-400">{p.score} pts</div>
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
            Câu {currentIndex + 1}/{room.words.length}
          </span>
          <span className="font-mono font-bold text-amber-400">
            ⏳ {timeLeft}s
          </span>
          <strong>{currentPlayer?.score ?? 0} điểm</strong>
        </div>

        {/* Vietnamese Meaning Clue */}
        <div className={styles.blastClue}>
          <p>&gt; TÌM TỪ TIẾNG ANH TƯƠNG ỨNG</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold max-w-xl mx-auto">
            &ldquo;{currentWord?.meaning}&rdquo;
          </h3>
          <small>
            {winnerNotice
              ? `⚡ ${winnerNotice.displayName} vừa cướp điểm (+${winnerNotice.points}đ)!`
              : feedback
              ? feedback.message
              : `Còn ${timeLeft} giây · Người bấm đúng đầu tiên sẽ cướp điểm!`}
          </small>
        </div>

        {/* Field with Cannon, Laser Guide, Targets */}
        <div
          ref={fieldRef}
          className={styles.field}
          data-paused={isFinished || isEliminated}
          onPointerMove={(event) => {
            if (hoveredOptionId !== null) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const cannonCenterX = bounds.width / 2;
            const cannonBottomY = bounds.height - 25;
            const mouseX = event.clientX - bounds.left;
            const mouseY = event.clientY - bounds.top;
            setAim((Math.atan2(mouseX - cannonCenterX, cannonBottomY - mouseY) * 180) / Math.PI);
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
                const isCorrectAnswer = hasAnswered && opt.id === currentWord?.id;
                const isDisabled = isWrongChoice || (hasAnswered && !isCorrectAnswer);

                return (
                  <button
                    key={`${currentIndex}-${opt.id}`}
                    type="button"
                    data-nth={(i % 4) + 1}
                    data-hit={shot === opt.id ? (isCorrectAnswer ? "correct" : isWrongChoice ? "wrong" : undefined) : undefined}
                    data-targeted={isHovered ? "true" : undefined}
                    className={`${styles.floatingTarget} ${
                      isWrongChoice ? styles.floatingTargetWrong : ""
                    } ${isCorrectAnswer ? styles.floatingTargetCorrect : ""}`}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      opacity: isWrongChoice ? 0.3 : isDisabled && !isCorrectAnswer ? 0.4 : 1,
                      cursor: isDisabled ? "not-allowed" : "pointer",
                    }}
                    disabled={isDisabled}
                    onClick={() => {
                      setShot(opt.id);
                      if (pos && fieldRef.current) {
                        setAim(getAngleToTarget(pos.x, pos.y, fieldRef.current));
                      }
                      handleSelectOption(opt);
                    }}
                    onPointerEnter={() => {
                      if (!isDisabled && !isEliminated) {
                        setHoveredOptionId(opt.id);
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
                    <span className={styles.reticle} aria-hidden="true">
                      <svg viewBox="0 0 32 32" fill="none">
                        <circle cx="16" cy="16" r="8" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="16" y1="2" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="16" y1="23" x2="16" y2="30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="2" y1="16" x2="9" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="22" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="16" cy="1.5" fill="currentColor" />
                      </svg>
                    </span>
                    {shot === opt.id && (
                      <span className={styles.hitBurst} aria-hidden="true">
                        {isCorrectAnswer ? "✦" : "×"}
                      </span>
                    )}
                  </button>
                );
              })}
            </>
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
            <div key={`shot-${shot}-${currentIndex}`} className={styles.shotBeam} style={{ rotate: `${aim}deg` }} aria-hidden="true" />
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
