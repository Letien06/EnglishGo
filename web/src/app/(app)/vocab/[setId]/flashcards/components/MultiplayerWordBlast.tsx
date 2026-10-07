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
import { subscribeGameRoom } from "@/lib/game-room-subscription";
import { wordBlastQuestionMs } from "@/lib/word-blast-timing";

interface GamePlayer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isHost: boolean;
  score: number;
  lives: number;
  combo: number;
  status: "waiting" | "playing" | "eliminated" | "finished";
  // Monotonic version marker written by the server on every player update.
  // Used to drop stale realtime snapshots (BUG-7b). Absent on old room docs.
  updatedAt?: number;
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
  questionDurationMs?: number;
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

  // Cannon aim state (the mouse-following crosshair reticle was removed for performance)
  const [aim, setAim] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [hoveredOptionId, setHoveredOptionId] = useState<number | null>(null);
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
  // BUG-8c: a finished room must always render the summary screen, even while a
  // winner celebration banner is still showing — otherwise the game gets stuck.
  const isFinished = finalized || room.status === "finished" || allEliminated;

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

  const QUESTION_DURATION = wordBlastQuestionMs(room.questionDurationMs) / 1000;
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION);

  // Mirror of the latest room state for use inside setTimeout callbacks.
  const roomRef = useRef<GameRoomData>(initialRoom);
  roomRef.current = room;

  // Guard so the winner celebration for a given question starts exactly once,
  // whether it is triggered by the realtime lastWinner broadcast or by the
  // answer POST response (whichever arrives first).
  const celebrationRef = useRef<{ active: boolean; questionIndex: number }>({
    active: false,
    questionIndex: -1,
  });

  // Show the "who grabbed this question" banner for 1600ms, then advance.
  // The next index is clamped to the last valid word so the client can never
  // render an out-of-bounds empty "Câu 81/80" (BUG-8b).
  const showWinnerBanner = (winner: {
    uid: string;
    displayName: string;
    word: string;
    points: number;
    questionIndex: number;
    isMe: boolean;
  }) => {
    if (
      celebrationRef.current.active &&
      celebrationRef.current.questionIndex === winner.questionIndex
    ) {
      return;
    }
    celebrationRef.current = { active: true, questionIndex: winner.questionIndex };
    setRoundWinner(winner);
    if (winnerTimerRef.current) clearTimeout(winnerTimerRef.current);
    winnerTimerRef.current = setTimeout(() => {
      celebrationRef.current = { active: false, questionIndex: -1 };
      setRoundWinner(null);
      setDisplayedIndex((prev) => {
        const r = roomRef.current;
        const maxIdx = Math.max(0, (r.words?.length ?? 1) - 1);
        const next =
          typeof r.currentIndex === "number" && r.currentIndex > prev
            ? r.currentIndex
            : prev + 1;
        return Math.min(next, maxIdx);
      });
      setHasAnswered(false);
      setDisabledOptions([]);
      setShot(null);
      setHoveredOptionId(null);
      setFeedback(null);
      setTimeLeft(QUESTION_DURATION);
    }, 1600);
  };

  // Realtime updates with polling only when the listener is unavailable
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
          prev.countdownEndsAt === data.countdownEndsAt &&
          prev.questionDurationMs === data.questionDurationMs
        ) {
          return prev;
        }
        return { ...prev, ...data };
      });
    };

    const handlePlayersUpdate = (list: GamePlayer[]) => {
      if (!list || list.length === 0) return;
      setPlayers((prev) => {
        const prevByUid = new Map(prev.map((p) => [p.uid, p]));
        // BUG-7b: SSE / onSnapshot / 350ms polling can race. The server stamps
        // every player write with a monotonic `updatedAt`, so drop any snapshot
        // older than what we already hold instead of letting it win by arrival order.
        const merged = list.map((incoming) => {
          const existing = prevByUid.get(incoming.uid);
          if (
            existing &&
            typeof incoming.updatedAt === "number" &&
            typeof existing.updatedAt === "number" &&
            incoming.updatedAt < existing.updatedAt
          ) {
            return existing;
          }
          return incoming;
        });
        if (
          prev.length === merged.length &&
          merged.every((m, i) => {
            const p = prev[i];
            return (
              p &&
              p.uid === m.uid &&
              p.score === m.score &&
              p.lives === m.lives &&
              p.status === m.status &&
              p.combo === m.combo &&
              p.updatedAt === m.updatedAt
            );
          })
        ) {
          return prev;
        }
        return merged;
      });
    };

    return subscribeGameRoom<GameRoomData, GamePlayer>(roomCode, {
      room: handleRoomUpdate,
      players: handlePlayersUpdate,
      identity: (uid) => setMyUid((prev) => prev || uid),
    });
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

      setHasAnswered(true);

      if (isMe) {
        if (!soundQuiet) playSuccessSound();
      } else {
        if (!soundQuiet) playFailSound();
        // Opponent won: aim cannon at opponent's winning word in CURRENT question options
        const winOpt = currentOptions.find(
          (o) => o.word.toLowerCase() === lw.word.toLowerCase()
        );
        if (winOpt) {
          const winIdx = currentOptions.indexOf(winOpt);
          const winFloat = floats[winIdx];
          setShot(winOpt.id);
          if (winFloat && fieldRef.current) {
            setAim(getAngleToTarget(winFloat.x, winFloat.y, fieldRef.current));
          }
        }
      }

      // Keep current question on screen for 1600ms so both players clearly see who grabbed it
      showWinnerBanner({
        uid: lw.uid,
        displayName: lw.displayName || "Đối thủ",
        word: lw.word,
        points: lw.points || 15,
        questionIndex: displayedIndex,
        isMe,
      });

      return;
    }

    // Advance question if server advanced currentIndex without any winner (e.g. timeout)
    if (typeof room.currentIndex === "number" && room.currentIndex > displayedIndex) {
      setDisplayedIndex(room.currentIndex);
      setHasAnswered(false);
      setDisabledOptions([]);
      setShot(null);
      setHoveredOptionId(null);
      setFeedback(null);
      setTimeLeft(QUESTION_DURATION);
    }
  }, [
    room.lastWinner,
    room.currentIndex,
    QUESTION_DURATION,
    roundWinner,
    displayedIndex,
    myUid,
    currentUserId,
    soundQuiet,
    currentOptions,
    floats,
  ]);

  // Use the stored room deadline so active legacy rooms retain their timing.
  useEffect(() => {
    // BUG-7c: an eliminated player must not keep calling /next and pushing
    // questions forward for the whole room.
    if (isFinished || isCountdown || isEliminated || Boolean(roundWinner)) return;

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
          // Optimistic reset: the next question is about to start, so restart
          // the countdown immediately instead of parking at 0s. Without this,
          // the timer sits at "Còn 0 giây" and then visually jumps back up
          // (e.g. 0s -> 10s) when the server's roundStartedAt arrives and the
          // effect above re-syncs from it. The server response still re-syncs
          // via roundStartedAt (a small downward correction), and a "finished"
          // status swaps in the summary screen anyway.
          return QUESTION_DURATION;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [displayedIndex, isFinished, isCountdown, isEliminated, roundWinner, roomCode, room.roundStartedAt, QUESTION_DURATION]);

  // Floating animation loop
  useEffect(() => {
    if (isFinished || isEliminated || isCountdown) return;

    let rafId: number;
    let lastTime = performance.now();
    let acc = 0;

    function animate(now: number) {
      const delta = Math.min(now - lastTime, 200);
      lastTime = now;
      // Throttle target-position state updates to ~30fps: pushing a React
      // setState 60x/sec re-renders the whole arena every frame (visible
      // jitter). Motion stays smooth because tickFloatingTarget integrates
      // the accumulated delta.
      acc += delta;
      if (acc >= 33) {
        const step = acc;
        acc = 0;
        setFloats((prev) => prev.map((f) => tickFloatingTarget(f, step)));
      }
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
      // BUG-9: never trust an optimistic score. The winner banner and the real
      // points are only shown after the server confirms them; the scoreboard
      // itself converges from the realtime server push. Lock input meanwhile so
      // the player can't double-submit while waiting.
      setHasAnswered(true);
      if (!soundQuiet) {
        playSuccessSound();
      }

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
          const data = json?.data;
          if (json.success && data && !data.skipped) {
            if (data.status === "finished") {
              setFinalized(true);
              setRoom((prev) => ({ ...prev, status: "finished" }));
            }
            // Server confirmed our grab — show the banner with the real points.
            // The realtime lastWinner broadcast usually arrives first; the
            // celebration guard makes the slower path a no-op.
            lastProcessedWinnerAt.current = Date.now();
            showWinnerBanner({
              uid: currentPlayer.uid,
              displayName: currentPlayer.displayName || "Bạn",
              word: option.word,
              points: typeof data.points === "number" ? data.points : 15,
              questionIndex: displayedIndex,
              isMe: true,
            });
          } else {
            // Too slow (opponent grabbed it first) or time expired — release the lock.
            setHasAnswered(false);
            if (data?.reason === "Time expired") {
              setFeedback({ message: "⏳ Hết giờ rồi, đáp án không được tính!", tone: "wrong" });
            } else {
              setFeedback({ message: "⚡ Đối thủ đã nhanh tay hơn!", tone: "wrong" });
            }
            window.setTimeout(() => setFeedback(null), 1500);
          }
        })
        .catch(() => {
          setHasAnswered(false);
        });
    } else {
      // BUG-7a: lives are server-authoritative. Never decrement them optimistically:
      // the server may skip this answer (e.g. the question already advanced), and an
      // optimistic decrement would desync the client into a phantom "eliminated" state.
      setDisabledOptions((prev) => (prev.includes(option.id) ? prev : [...prev, option.id]));

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
          const data = json?.data;
          if (data?.status === "finished") {
            setFinalized(true);
            setRoom((prev) => ({ ...prev, status: "finished" }));
          }
          if (data && typeof data.lives === "number") {
            const lives = data.lives;
            // Apply the authoritative heart count IMMEDIATELY from the response
            // instead of waiting for the realtime push — this is the fastest
            // possible sync path (~1 RTT). Stamp with Date.now() so the
            // updatedAt-ordered merge in handlePlayersUpdate keeps it.
            const myPlayerUid = currentPlayer.uid;
            setPlayers((prevPlayers) =>
              prevPlayers.map((p) =>
                p.uid === myPlayerUid
                  ? {
                      ...p,
                      lives,
                      combo: typeof data.combo === "number" ? data.combo : p.combo,
                      updatedAt: Date.now(),
                    }
                  : p
              )
            );
            if (lives <= 0) {
              setHasAnswered(true);
              setFeedback({
                message: "💀 BẠN ĐÃ HẾT TIM! Màn chọn đã bị khóa. Hãy quan sát trận đấu.",
                tone: "wrong",
              });
            } else {
              setFeedback({
                message: `❌ Sai rồi! -1 tim (Còn ${lives}❤️)`,
                tone: "wrong",
              });
              window.setTimeout(() => setFeedback(null), 1200);
            }
          } else if (data?.skipped) {
            // Answer wasn't counted (question advanced or time expired) — no heart lost.
            setFeedback({
              message:
                data.reason === "Time expired"
                  ? "⏳ Hết giờ rồi, đáp án không được tính!"
                  : "Câu hỏi đã chuyển, đáp án này không được tính.",
              tone: "wrong",
            });
            window.setTimeout(() => setFeedback(null), 1200);
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
              : `Phòng: ${roomCode} · Đã chơi ${displayedIndex + 1}/${room.words.length} câu`}
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

        {/* Field with Cannon, Laser Guide, Targets (mouse-following reticle removed for performance) */}
        <div
          ref={fieldRef}
          className={styles.field}
          data-paused={isFinished || isEliminated}
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

          {/* Crosshair reticle removed for performance (see tweak/battle-performance) */}

          {/* Aim Laser Guide */}

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
