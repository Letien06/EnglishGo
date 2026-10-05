"use client";

import React, { useEffect, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { rainHint } from "@/lib/vocab-arcade";
import { normalizeVocabularyAnswer } from "@/lib/vocab-content";
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

interface RainDropData {
  index: number;
  lane: number;
  spawnAt: number;
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
  activeDrops?: RainDropData[];
  nextIndex?: number;
  droppedWord?: VocabWordCard | null;
  lastWinner?: {
    uid: string;
    displayName: string;
    word: string;
    points: number;
    at?: number;
  };
}

interface MultiplayerVocabularyRainProps {
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

const DROP_DURATION = 13000; // 13 seconds from top of track to ground

export function MultiplayerVocabularyRain({
  roomCode,
  initialRoom,
  initialPlayers,
  currentUserId,
  muted,
  onExit,
  onReturnToLobby,
}: MultiplayerVocabularyRainProps) {
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
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; tone: "correct" | "wrong" } | null>(null);

  // Dedicated permanent finalization state to prevent result screen flashing or reverting
  const [finalized, setFinalized] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [myUid, setMyUid] = useState<string>(currentUserId);

  const inputRef = useRef<HTMLInputElement>(null);
  const expiredRef = useRef<Set<number>>(new Set());

  // Real-time animation clock for smooth falling drops
  const [now, setNow] = useState(Date.now());

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

  // When all players run out of hearts or room ends, finalize permanently
  const allEliminated = players.length >= 1 && players.every((p) => (p.lives ?? 3) <= 0);
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

  // Real-time listener via Firestore with guarded polling fallback
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

              const wordsDiffer =
                Boolean(data.words?.length) &&
                (!prev.words?.length ||
                  prev.words.length !== data.words.length ||
                  prev.words[0]?.id !== data.words[0]?.id);

              // Guard re-renders if no state difference
              if (
                !wordsDiffer &&
                prev.status === data.status &&
                prev.currentIndex === data.currentIndex &&
                prev.roundStartedAt === data.roundStartedAt &&
                prev.countdownEndsAt === data.countdownEndsAt &&
                JSON.stringify(prev.activeDrops) === JSON.stringify(data.activeDrops) &&
                prev.droppedWord?.id === data.droppedWord?.id
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

    // Polling fallback every 2500ms
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

              const wordsDiffer =
                Boolean(r.words?.length) &&
                (!prev.words?.length ||
                  prev.words.length !== r.words.length ||
                  prev.words[0]?.id !== r.words[0]?.id);

              if (
                !wordsDiffer &&
                prev.status === r.status &&
                prev.currentIndex === r.currentIndex &&
                prev.roundStartedAt === r.roundStartedAt &&
                prev.countdownEndsAt === r.countdownEndsAt &&
                JSON.stringify(prev.activeDrops) === JSON.stringify(r.activeDrops) &&
                prev.droppedWord?.id === r.droppedWord?.id
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
    }, 1000);

    return () => {
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
      window.clearInterval(pollTimer);
    };
  }, [roomCode, onReturnToLobby]);

  // Identify current player accurately
  const currentPlayer =
    players.find((p) => p.uid === myUid) ||
    players.find((p) => p.uid === currentUserId) ||
    null;

  const isEliminated = Boolean(currentPlayer && (currentPlayer.lives ?? 3) <= 0);

  // Active falling drops from room, with fallback
  const activeDrops: RainDropData[] = React.useMemo(() => {
    if (room.activeDrops && room.activeDrops.length > 0) {
      return room.activeDrops;
    }
    const idx = room.currentIndex ?? 0;
    if (room.words?.[idx]) {
      return [{ index: idx, lane: 0, spawnAt: room.roundStartedAt ?? now }];
    }
    return [];
  }, [room.activeDrops, room.currentIndex, room.words, room.roundStartedAt, now]);

  // Falling animation loop: updates `now` timestamp for smooth CSS translateY
  useEffect(() => {
    if (isFinished || isEliminated || isCountdown) return;

    let rafId: number;
    let lastTick = performance.now();

    function loop(current: number) {
      if (current - lastTick >= 60) {
        setNow(Date.now());
        lastTick = current;
      }
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isFinished, isEliminated, isCountdown]);

  // Drop crash / expiration handler
  const handleDropCrash = async (dropIndex: number) => {
    if (expiredRef.current.has(dropIndex)) return;
    expiredRef.current.add(dropIndex);

    // Remove drop locally
    setRoom((prev) => ({
      ...prev,
      activeDrops: (prev.activeDrops || []).filter((d) => d.index !== dropIndex),
      droppedWord: prev.words?.[dropIndex] || null,
    }));

    if (!soundQuiet) {
      playFailSound();
    }

    try {
      await fetch("/api/vocab/game-room/rain-drop-expire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, dropIndex }),
      });
    } catch {}
  };

  // Submit correct drop answer - CẬP NHẬT ĐIỂM NGAY, CHỈ SOUND KHÔNG ĐỌC CHỮ
  const submitDropAnswer = async (dropIndex: number, word: VocabWordCard) => {
    if (isEliminated || isFinished || isCountdown) return;
    if (!currentPlayer) return;

    setFeedback({
      message: `Chính xác! Bạn đã bắt được từ "${word.word}"!`,
      tone: "correct",
    });
    window.setTimeout(() => setFeedback(null), 1200);

    const pointsEarned = 15 + Math.min(((currentPlayer.combo || 0) + 1) * 2, 10);
    // Cập nhật điểm ngay lập tức
    setPlayers((prev) =>
      prev.map((p) =>
        p.uid === currentPlayer.uid
          ? { ...p, score: (p.score || 0) + pointsEarned, combo: (p.combo || 0) + 1 }
          : p
      )
    );

    // Xóa từ rơi khỏi màn hình ngay lập tức
    setRoom((prev) => ({
      ...prev,
      activeDrops: (prev.activeDrops || []).filter((d) => d.index !== dropIndex),
    }));

    if (!soundQuiet) {
      playSuccessSound();
    }

    // Gửi server trong nền
    fetch("/api/vocab/game-room/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: roomCode,
        questionIndex: dropIndex,
        correct: true,
        selected: word.word,
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
  };

  // Handle typing input and match prefix in real time
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTyped(val);

    const normalized = normalizeVocabularyAnswer(val);
    if (!normalized) return;

    // Check if typed equals ANY active drop
    for (const drop of activeDrops) {
      if (drop.spawnAt > now) continue;
      const word = room.words?.[drop.index];
      if (word && normalizeVocabularyAnswer(word.word) === normalized) {
        submitDropAnswer(drop.index, word);
        setTyped("");
        return;
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeVocabularyAnswer(typed);
    if (!normalized) return;

    for (const drop of activeDrops) {
      if (drop.spawnAt > now) continue;
      const word = room.words?.[drop.index];
      if (word && normalizeVocabularyAnswer(word.word) === normalized) {
        submitDropAnswer(drop.index, word);
        setTyped("");
        return;
      }
    }

    setFeedback({
      message: "Chưa khớp với từ nào đang rơi, thử lại nhé!",
      tone: "wrong",
    });
    window.setTimeout(() => setFeedback(null), 1200);
  };

  // Focus input automatically
  useEffect(() => {
    if (!isCountdown && !isEliminated && !isFinished) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [isCountdown, isEliminated, isFinished]);

  // Check drop crash conditions
  useEffect(() => {
    if (isFinished || isCountdown) return;

    for (const drop of activeDrops) {
      if (now < drop.spawnAt) continue;
      const elapsed = now - drop.spawnAt;
      if (elapsed >= DROP_DURATION) {
        handleDropCrash(drop.index);
      }
    }
  }, [now, activeDrops, isFinished, isCountdown]);

  // RENDER: 5-Second Countdown Screen
  if (isCountdown && room.countdownEndsAt) {
    return (
      <MultiplayerCountdown
        countdownEndsAt={room.countdownEndsAt}
        gameMode="rain"
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
          <div className="text-6xl mb-3 animate-bounce">🌧️</div>
          <h2 className="text-3xl font-black text-[var(--ink)] mb-2 tracking-wide uppercase">
            TỔNG KẾT MƯA TỪ VỰNG
          </h2>
          <p className="text-[var(--muted)] mb-8 font-medium">
            {allEliminated
              ? "Toàn bộ người chơi đã hết tim — Trận đấu kết thúc!"
              : `Phòng: ${roomCode} · Hoàn thành các từ rơi`}
          </p>

          {/* Winner banner */}
          {winner && (
            <div className="bg-gradient-to-r from-amber-500/15 via-amber-400/25 to-amber-500/15 border-2 border-amber-400/50 rounded-2xl p-6 mb-8 shadow-lg">
              <div className="text-xs uppercase tracking-widest font-black text-amber-400 mb-1">
                👑 Quán quân gõ nhanh
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

  const prefix = normalizeVocabularyAnswer(typed);

  return (
    <section className={`${styles.arcadeRound} relative min-h-[640px]`} aria-label="Mưa từ vựng Đối Kháng">
      {/* Realtime Scoreboard in corner */}
      <MultiplayerScoreboard players={players} currentUserId={myUid || currentUserId} />

      {/* Top Header */}
      <header className={styles.toolbar}>
        <div>
          <span className={styles.eyebrow}>
            ĐỐI KHÁNG TRỰC TIẾP · PHÒNG #{roomCode}
          </span>
          <h2 className="text-xl font-bold text-[var(--ink)]">Mưa Từ Vựng — Đua Tốc Độ</h2>
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

      {/* Rain Arena matching Solo Mode */}
      <div className={styles.rainArena}>
        {/* Scoreboard bar */}
        <div className={styles.scoreboard}>
          <span className={styles.hearts} aria-label={`Còn ${currentPlayer?.lives ?? 0} mạng`}>
            {"❤️".repeat(Math.max(0, currentPlayer?.lives ?? 0))}
            <span>{"🤍".repeat(Math.max(0, 3 - Math.max(0, currentPlayer?.lives ?? 0)))}</span>
          </span>
          <span className="font-bold">
            Số từ còn lại: {Math.max(0, (room.words?.length || 0) - (room.nextIndex || 0))}
          </span>
          <span className="font-mono font-bold text-teal-400">
            Combo x{Math.min(4, 1 + Math.floor((currentPlayer?.combo || 0) / 3))}
          </span>
          <strong>{currentPlayer?.score ?? 0} điểm</strong>
        </div>

        {/* Rain Falling Field with Lanes */}
        <div className={styles.rainField} data-paused={isFinished || isEliminated}>
          {activeDrops.map((drop) => {
            if (now < drop.spawnAt) return null;
            const word = room.words?.[drop.index];
            if (!word) return null;

            const elapsed = now - drop.spawnAt;
            const fraction = Math.min(1, Math.max(0, elapsed / DROP_DURATION));
            const remainingSec = Math.max(0, Math.ceil((DROP_DURATION - elapsed) / 1000));

            const isMatching = Boolean(
              prefix && normalizeVocabularyAnswer(word.word).startsWith(prefix)
            );

            const hint = isMatching
              ? [...word.word].map((letter, i) => (i < typed.trim().length ? letter : "_")).join("")
              : rainHint(word.word, fraction);

            return (
              <div
                key={`drop-${drop.index}`}
                className={styles.rainTrack}
                data-lane={drop.lane}
                style={{ transform: `translateY(${fraction * 100}%)` }}
              >
                <div
                  className={styles.rainClue}
                  data-matching={isMatching ? "true" : undefined}
                >
                  <strong title={word.meaning}>{word.meaning}</strong>
                  <span aria-label="Gợi ý chữ">{hint}</span>
                  <small>{remainingSec}s</small>
                </div>
              </div>
            );
          })}

          <div className={styles.ground} />
        </div>

        {/* Answer bar — shows the most recently dropped word without TTS */}
        {room.droppedWord && (
          <div className={styles.rainAnswerBar} data-correct={false}>
            <span>
              Đáp án vừa rơi chạm đất: <strong>{room.droppedWord.word}</strong>
            </span>
            <span className={styles.rainAnswerMeaning}>{room.droppedWord.meaning}</span>
          </div>
        )}
      </div>

      {/* Spectator Locked Screen OR Typing Form */}
      {isEliminated ? (
        <div className="relative w-full p-6 text-center select-none bg-red-950/20 rounded-2xl border-2 border-dashed border-red-500/50 backdrop-blur-sm mx-auto max-w-2xl my-3">
          <div className="text-5xl mb-2 animate-bounce">💀</div>
          <h3 className="text-xl font-black text-red-500 mb-1 uppercase tracking-wide">
            BẠN ĐÃ HẾT TIM & BỊ LOẠI!
          </h3>
          <p className="text-xs sm:text-sm font-semibold text-[var(--ink2)] max-w-lg mx-auto mb-3">
            Màn gõ của bạn đã bị khóa. Hãy quan sát các đối thủ còn lại tiếp tục đấu trí đến khi kết thúc nhé!
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--line)] rounded-full text-xs font-bold text-[var(--ink)] shadow-md">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[var(--ink2)]">Đang thi đấu:</span>
            {players.filter((p) => (p.lives ?? 3) > 0).map((p) => (
              <span key={p.uid} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold">
                {p.displayName} ({p.lives}❤️ · {p.score}đ)
              </span>
            ))}
          </div>
        </div>
      ) : (
        <form className={styles.rainInput} onSubmit={handleFormSubmit}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            aria-label="Từ tiếng Anh"
            placeholder="Gõ từ tiếng Anh tương ứng với nghĩa đang rơi..."
            value={typed}
            disabled={isEliminated || isFinished || isCountdown}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Escape") setTyped("");
            }}
          />
          <button
            type="submit"
            disabled={!typed.trim() || isEliminated || isFinished || isCountdown}
            className={`${styles.button} ${styles.primary}`}
          >
            Bắt từ
          </button>
        </form>
      )}

      {feedback && (
        <div
          className={`text-center font-bold text-sm py-1.5 px-4 rounded-full max-w-sm mx-auto mt-2 transition-all ${
            feedback.tone === "correct"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              : "bg-red-500/20 text-red-300 border border-red-500/40"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Helper text */}
      <footer className="text-center text-xs text-[var(--muted)] mt-2">
        {isEliminated
          ? "Bạn đang ở chế độ quan sát trận đấu."
          : "Gõ nhanh từ tiếng Anh trước khi từ rơi chạm đất. Tối đa 2 từ rơi cùng lúc trên 2 làn. Esc xoá chữ đang gõ!"}
      </footer>
    </section>
  );
}
