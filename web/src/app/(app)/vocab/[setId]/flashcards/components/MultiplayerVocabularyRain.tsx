"use client";

import React, { useEffect, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { rainHint } from "@/lib/vocab-arcade";
import { normalizeVocabularyAnswer } from "@/lib/vocab-content";
import useVocabularyAudio from "../useVocabularyAudio";
import { MultiplayerScoreboard } from "./MultiplayerScoreboard";
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
  status: "waiting" | "playing" | "finished";
  words: VocabWordCard[];
  currentIndex: number;
  roundStartedAt?: number;
  lastWinner?: {
    uid: string;
    displayName: string;
    word: string;
    points: number;
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
  } catch {
    /* audio unavailable */
  }
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
  } catch {
    /* audio unavailable */
  }
}

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
    status: initialRoom.status === "finished" ? "finished" : "playing",
  }));
  const [players, setPlayers] = useState<GamePlayer[]>(initialPlayers);
  const [soundQuiet, setSoundQuiet] = useState(muted);
  const [typed, setTyped] = useState("");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "correct" | "wrong" } | null>(null);

  // Dedicated locking state for when local player runs out of hearts
  const [isLocalEliminated, setIsLocalEliminated] = useState(false);

  // Dedicated permanent finalization state to prevent result screen flashing or reverting
  const [finalized, setFinalized] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [myUid, setMyUid] = useState<string>(currentUserId);
  const [winnerNotice, setWinnerNotice] = useState<{ displayName: string; points: number; word: string } | null>(null);
  const [crashedNotice, setCrashedNotice] = useState<{ word: string; meaning: string } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const { speakWord } = useVocabularyAudio();

  const QUESTION_DURATION = 13; // 13 seconds for each rain drop
  const [timeLeft, setTimeLeft] = useState(QUESTION_DURATION);
  const [fraction, setFraction] = useState(0);

  useEffect(() => {
    if (currentUserId && currentUserId !== myUid) {
      setMyUid(currentUserId);
    }
  }, [currentUserId]);

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
        word: room.lastWinner.word,
      });
      const timer = window.setTimeout(() => {
        setWinnerNotice(null);
      }, 3500);
      return () => window.clearTimeout(timer);
    }
  }, [room.currentIndex, room.lastWinner?.uid, room.lastWinner?.points]);

  // Real-time listener via Firestore with polling fallback
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
              return data;
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
          if (list.length > 0) setPlayers(list);
        },
        () => {},
      );
    } catch {}

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
              if (json.data.room.status === "finished") return { ...prev, ...json.data.room, status: "finished" };
              if ((json.data.room.currentIndex ?? 0) < (prev.currentIndex ?? 0)) return prev;
              return json.data.room;
            });
          }
          if (json.data.players) setPlayers(json.data.players);
          if (json.data.currentUserId) {
            setMyUid((prev) => prev || json.data.currentUserId);
          }
        }
      } catch {}
    }, 400);

    return () => {
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
      window.clearInterval(pollTimer);
    };
  }, [roomCode, onReturnToLobby]);

  // Current word
  const currentIndex = room.currentIndex ?? 0;
  const currentWord = room.words?.[currentIndex];

  const currentPlayer =
    players.find((p) => p.uid === myUid) ||
    players.find((p) => p.uid === currentUserId) ||
    null;

  const isEliminated =
    isLocalEliminated || Boolean(currentPlayer && (currentPlayer.lives ?? 3) <= 0);

  // Sync state on question change
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  if (prevIndex !== currentIndex) {
    setPrevIndex(currentIndex);
    setTimeLeft(QUESTION_DURATION);
    setFraction(0);
    if (!isEliminated) {
      setHasAnswered(false);
      setTyped("");
      setFeedback(null);
    }
  }

  // Smooth falling animation ticker
  useEffect(() => {
    if (isFinished) return;

    let start = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const frac = Math.min(1, elapsed / QUESTION_DURATION);
      setFraction(frac);
      const remaining = Math.max(0, Math.ceil(QUESTION_DURATION - elapsed));
      setTimeLeft(remaining);

      // Drop reached the ground!
      if (frac >= 1) {
        window.clearInterval(interval);
        handleDropCrash();
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [currentIndex, isFinished]);

  // Auto-focus input when alive
  useEffect(() => {
    if (!isEliminated && !isFinished) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [currentIndex, isEliminated, isFinished]);

  // Drop hits ground without being caught
  const handleDropCrash = async () => {
    if (isFinished) return;
    if (!soundQuiet) playFailSound();

    if (currentWord) {
      setCrashedNotice({ word: currentWord.word, meaning: currentWord.meaning });
      window.setTimeout(() => setCrashedNotice(null), 3000);
    }

    // If local player is alive and hasn't answered, subtract 1 heart
    if (currentPlayer && (currentPlayer.lives ?? 3) > 0 && !hasAnswered) {
      if ((currentPlayer.lives ?? 3) - 1 <= 0) {
        setIsLocalEliminated(true);
      }
      fetch("/api/vocab/game-room/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: roomCode,
          questionIndex: currentIndex,
          correct: false,
          selected: "",
        }),
      }).catch(() => {});
    }

    // Host or fallback advances question
    fetch("/api/vocab/game-room/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: roomCode, questionIndex: currentIndex }),
    }).catch(() => {});
  };

  // Submit word (either on Enter or auto-catch when exact match)
  const handleSubmitWord = async (text: string) => {
    if (isEliminated || hasAnswered || isFinished) return;
    if (!currentWord || !currentPlayer) return;

    const normalizedTyped = normalizeVocabularyAnswer(text);
    const normalizedExpected = normalizeVocabularyAnswer(currentWord.word);

    if (normalizedTyped === normalizedExpected) {
      // CORRECT CATCH!
      setHasAnswered(true);
      setTyped("");
      setFeedback({ message: `✓ Chính xác! Bạn đã bắt được từ "${currentWord.word}"!`, tone: "correct" });

      if (!soundQuiet) {
        playSuccessSound();
        window.setTimeout(() => speakWord(currentWord), 200);
      }

      try {
        await fetch("/api/vocab/game-room/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: roomCode,
            questionIndex: currentIndex,
            correct: true,
            selected: currentWord.word,
          }),
        });
      } catch {}
    } else {
      // INCORRECT ATTEMPT
      setFeedback({ message: "Chưa đúng, thử lại nhanh!", tone: "wrong" });
      window.setTimeout(() => setFeedback(null), 1200);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTyped(val);
    if (!currentWord) return;

    // Fast automatic catch if typed full word
    if (normalizeVocabularyAnswer(val) === normalizeVocabularyAnswer(currentWord.word)) {
      handleSubmitWord(val);
    }
  };

  // Lane determination (3 distinct lanes across the screen)
  const lanePositions = [10, 40, 70];
  const laneIndex = (currentIndex % 3);
  const laneLeft = lanePositions[laneIndex];

  // Hint generation based on prefix and falling fraction
  const currentPrefix = normalizeVocabularyAnswer(typed);
  const matchesPrefix = !!currentPrefix && !!currentWord && normalizeVocabularyAnswer(currentWord.word).startsWith(currentPrefix);
  const displayHint = currentWord
    ? matchesPrefix
      ? [...currentWord.word].map((letter, i) => (i < typed.trim().length ? letter : "_")).join(" ")
      : rainHint(currentWord.word, fraction)
    : "";

  // ---- PODIUM / VICTORY SCREEN ----
  if (isFinished) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    return (
      <div className={`${styles.podiumEntrance} flex flex-col items-center justify-center min-h-[70vh] p-6 text-[var(--ink)]`}>
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 max-w-xl w-full shadow-2xl text-center">
          <div className="text-6xl mb-3">🌧️🏆</div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-[var(--ink)]">TỔNG KẾT MƯA TỪ VỰNG</h1>
          <p className="text-[var(--muted)] mb-8 font-medium">
            {allEliminated
              ? "Toàn bộ người chơi đã hết tim — Trận đấu kết thúc!"
              : `Phòng: ${roomCode} · Hoàn thành ${room.words.length} từ vựng`}
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

  return (
    <section className={`${styles.arcadeRound} relative min-h-[640px]`} aria-label="Mưa Từ Vựng Đối Kháng">
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

      {/* Scoreboard bar */}
      <div className={styles.scoreboard}>
        <span className={styles.hearts} aria-label={`Còn ${currentPlayer?.lives ?? 0} mạng`}>
          {"❤️".repeat(Math.max(0, currentPlayer?.lives ?? 0))}
          <span>{"🤍".repeat(Math.max(0, 3 - Math.max(0, currentPlayer?.lives ?? 0)))}</span>
        </span>
        <span className="font-bold">
          Từ {currentIndex + 1}/{room.words.length}
        </span>
        <span className="font-mono font-bold text-amber-400">
          ⏳ {timeLeft}s
        </span>
        <strong>{currentPlayer?.score ?? 0} điểm</strong>
      </div>

      {/* Arena */}
      <div className={styles.rainArena} style={{ minHeight: "440px" }}>
        {/* Winner or Miss Notice */}
        {winnerNotice && (
          <div className="m-3 bg-amber-400/20 border border-amber-400/40 text-amber-300 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center gap-2 animate-pulse">
            <span>⚡</span>
            <span>
              {winnerNotice.displayName} vừa cướp điểm từ &ldquo;{winnerNotice.word}&rdquo; (+{winnerNotice.points}đ)!
            </span>
          </div>
        )}

        {crashedNotice && (
          <div className="m-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center gap-2">
            <span>💥</span>
            <span>
              Đã rơi chạm đất! Đáp án: <strong>{crashedNotice.word}</strong> ({crashedNotice.meaning})
            </span>
          </div>
        )}

        {/* Rain Falling Field */}
        <div className={styles.rainField} style={{ height: "350px", position: "relative" }}>
          {currentWord && (
            <div
              key={`drop-${currentIndex}`}
              style={{
                position: "absolute",
                left: `${laneLeft}%`,
                top: `${fraction * 65}%`,
                transition: "top 100ms linear",
                width: "min(90%, 250px)",
                transform: "translateX(-10%)",
              }}
            >
              <div
                className={styles.rainClue}
                data-matching={matchesPrefix ? "true" : undefined}
                style={{
                  borderWidth: "2px",
                  borderColor: matchesPrefix ? "var(--teal-ink)" : undefined,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                }}
              >
                <strong className="text-base sm:text-lg font-bold text-[var(--ink)] block mb-1">
                  {currentWord.meaning}
                </strong>
                <span className="text-xs font-mono tracking-widest text-[var(--muted)] block mb-1">
                  {displayHint}
                </span>
                <small className="text-[11px] font-semibold text-amber-500">
                  {timeLeft}s
                </small>
              </div>
            </div>
          )}

          <div className={styles.ground} />
        </div>
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
        <form
          className="flex gap-2 max-w-2xl mx-auto w-full mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitWord(typed);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className={`${styles.input} flex-1 text-base sm:text-lg font-semibold py-3 px-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-amber-400`}
            placeholder="Gõ từ tiếng Anh tương ứng với nghĩa đang rơi..."
            value={typed}
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
            disabled={!typed.trim()}
            className={`${styles.button} ${styles.primary} px-6 py-3 font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed`}
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
          : "Gõ nhanh từ tiếng Anh trước khi từ rơi chạm đất. Người đầu tiên gõ đúng sẽ cướp được điểm!"}
      </footer>
    </section>
  );
}
