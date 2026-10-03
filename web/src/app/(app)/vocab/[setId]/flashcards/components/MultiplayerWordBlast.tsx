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

interface MultiplayerWordBlastProps {
  roomCode: string;
  initialRoom: GameRoomData;
  initialPlayers: GamePlayer[];
  currentUserId: string;
  muted: boolean;
  onExit: () => void;
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

/* Pseudo-random generator with seed so all players see identical target layouts */
function pseudoRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function MultiplayerWordBlast({
  roomCode,
  initialRoom,
  initialPlayers,
  currentUserId,
  muted,
  onExit,
}: MultiplayerWordBlastProps) {
  const [room, setRoom] = useState<GameRoomData>(() => ({
    ...initialRoom,
    status: initialRoom.status === "finished" ? "finished" : "playing",
  }));
  const [players, setPlayers] = useState<GamePlayer[]>(initialPlayers);
  const [soundQuiet, setSoundQuiet] = useState(muted);
  const [disabledOptions, setDisabledOptions] = useState<number[]>([]);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "correct" | "wrong" } | null>(null);

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

  // When all players run out of hearts, automatically finalize and show results
  const allEliminated = players.length > 0 && players.every((p) => (p.lives ?? 3) <= 0);
  const isFinished = room.status === "finished" || allEliminated;

  useEffect(() => {
    if (allEliminated && room.status === "playing") {
      setRoom((prev) => ({ ...prev, status: "finished" }));
      fetch("/api/vocab/game-room/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, questionIndex: room.currentIndex ?? 0 }),
      }).catch(() => {});
    }
  }, [allEliminated, room.status, roomCode, room.currentIndex]);

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
            setRoom((prev) => {
              if (data.status === "finished") return data;
              // Never revert back to an older question index
              if ((data.currentIndex ?? 0) < (prev.currentIndex ?? 0)) return prev;
              return data;
            });
          }
        },
        () => {
          /* Fallback will handle errors */
        },
      );

      unsubPlayers = onSnapshot(
        playersRef,
        (snap) => {
          const list: GamePlayer[] = [];
          snap.forEach((d) => list.push(d.data() as GamePlayer));
          if (list.length > 0) setPlayers(list);
        },
        () => {
          /* Fallback will handle errors */
        },
      );
    } catch {
      /* Handled by polling fallback */
    }

    // Polling fallback every 400ms for instant real-time sync across players
    const pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/vocab/game-room?code=${roomCode}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.room) {
            setRoom((prev) => {
              if (json.data.room.status === "finished") return json.data.room;
              if ((json.data.room.currentIndex ?? 0) < (prev.currentIndex ?? 0)) return prev;
              return json.data.room;
            });
          }
          if (json.data.players) setPlayers(json.data.players);
          if (json.data.currentUserId) setMyUid(json.data.currentUserId);
        }
      } catch {
        /* Ignore transient poll errors */
      }
    }, 400);

    return () => {
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
      window.clearInterval(pollTimer);
    };
  }, [roomCode, myUid]);

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

  // Synchronously adjust round states when question index changes to prevent jarring jumps
  const [prevIndex, setPrevIndex] = useState(currentIndex);
  if (prevIndex !== currentIndex) {
    setPrevIndex(currentIndex);
    setHasAnswered(false);
    setDisabledOptions([]);
    setFeedback(null);
    setTimeLeft(QUESTION_DURATION);
    setFloats(createFloatingTargets(currentOptions.length || 4));
  }

  // Timer countdown
  useEffect(() => {
    if (isFinished) return;

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Question expired: host advances immediately; any player acts as fallback
          const isHost = players.find((p) => p.uid === myUid)?.isHost;
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
  }, [currentIndex, isFinished, roomCode, myUid, players]);

  // Floating animation loop
  useEffect(() => {
    if (isFinished) return;

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
  }, [currentIndex, isFinished]);

  const currentPlayer =
    players.find((p) => p.uid === myUid) ||
    players.find((p) => p.uid === currentUserId) ||
    players[0];
  const isEliminated = (currentPlayer?.lives ?? 3) <= 0;

  // Handle answering
  const handleSelectOption = async (option: VocabWordCard) => {
    if (hasAnswered || isFinished) return;
    if (disabledOptions.includes(option.id)) return;

    const me = currentPlayer;
    if (me && (me.lives ?? 3) <= 0) return;

    const isCorrect = option.id === currentWord?.id;

    if (isCorrect) {
      setHasAnswered(true);
      setFeedback({ message: "CHÍNH XÁC! 🎯 CƯỚP ĐIỂM THÀNH CÔNG!", tone: "correct" });
      const targetUid = me?.uid || myUid;
      const pointsEarned = 15 + Math.min(((me?.combo || 0) + 1) * 2, 10);
      setPlayers((prev) =>
        prev.map((p) =>
          p.uid === targetUid
            ? { ...p, score: (p.score || 0) + pointsEarned, combo: (p.combo || 0) + 1 }
            : p
        )
      );
      if (!soundQuiet && currentWord) {
        playSuccessSound();
        window.setTimeout(() => speakWord(currentWord), 200);
      }
    } else {
      // Trả lời sai: trừ 1 tim, KHÔNG khóa toàn bộ nếu còn tim (được phép click tiếp đáp án khác)
      const targetUid = me?.uid || myUid;
      const currentLives = me?.lives ?? 3;
      const newLives = Math.max(0, currentLives - 1);

      // Chỉ vô hiệu hóa duy nhất đáp án sai vừa click
      setDisabledOptions((prev) => (prev.includes(option.id) ? prev : [...prev, option.id]));

      setPlayers((prev) =>
        prev.map((p) => (p.uid === targetUid ? { ...p, lives: newLives, combo: 0 } : p))
      );

      if (newLives <= 0) {
        // Hết sạch tim: khóa câu hỏi và chuyển sang trạng thái bị loại
        setHasAnswered(true);
        setFeedback({ message: "💀 BẠN ĐÃ HẾT TIM! Bạn đã bị loại khỏi trận đấu...", tone: "wrong" });
      } else {
        // Vẫn còn tim: cho phép click đáp án tiếp theo
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
          setRoom((prev) => ({ ...prev, status: "finished" }));
        }

        // Fast re-poll to ensure all players & scores are in exact sync
        fetch(`/api/vocab/game-room?code=${roomCode}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.success && d.data) {
              if (d.data.room) {
                setRoom((prev) => (d.data.room.currentIndex < (prev.currentIndex ?? 0) ? prev : d.data.room));
              }
              if (d.data.players) setPlayers(d.data.players);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error("Failed to submit answer", err);
    }
  };

  // Keyboard 1-4 shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (hasAnswered || isEliminated || isFinished) return;
      const key = parseInt(e.key, 10);
      if (key >= 1 && key <= currentOptions.length) {
        const selected = currentOptions[key - 1];
        if (selected && !disabledOptions.includes(selected.id)) {
          handleSelectOption(selected);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasAnswered, isEliminated, isFinished, currentOptions, disabledOptions]);

  // ---- PODIUM / VICTORY SCREEN ----
  if (isFinished) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const allEliminated = players.every((p) => (p.lives ?? 3) <= 0);

    return (
      <div className={`${styles.podiumEntrance} flex flex-col items-center justify-center min-h-[70vh] p-6 text-[var(--ink)]`}>
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-3xl p-8 max-w-xl w-full shadow-2xl text-center">
          <div className="text-6xl mb-3">🏆</div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">TỔNG KẾT ĐỐI KHÁNG</h1>
          <p className="text-[var(--muted)] mb-8 font-medium">
            {allEliminated
              ? "Toàn bộ người chơi đã hết tim — Trận đấu kết thúc!"
              : `Phòng: ${roomCode} · Hoàn thành ${room.words.length} câu hỏi`}
          </p>

          {/* Winner banner */}
          {winner && (
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/20 to-amber-500/10 border border-amber-400/40 rounded-2xl p-6 mb-8">
              <div className="text-xs uppercase tracking-widest font-bold text-amber-600 mb-1">
                Người chiến thắng
              </div>
              <div className="text-2xl font-black text-amber-700">{winner.displayName}</div>
              <div className="text-4xl font-black font-mono text-amber-600 mt-2">
                {winner.score} <span className="text-lg font-medium">điểm</span>
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
                  className={`flex items-center justify-between p-4 rounded-xl border ${
                    isMe
                      ? "border-[var(--primary)] bg-blue-50/40 font-semibold ring-2 ring-[var(--primary)]/30"
                      : "border-[var(--line)] bg-[var(--surface-soft)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl w-8 text-center">{medals[idx] || `#${idx + 1}`}</span>
                    <div className="text-left">
                      <div className="font-bold flex items-center gap-2">
                        {p.displayName}
                        {isMe && <span className="text-xs text-[var(--primary)] font-normal">(Bạn)</span>}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {p.lives > 0 ? "Còn mạng ❤️" : "Hết mạng 💀"}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono font-black text-xl">{p.score} pts</div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4">
            <button
              onClick={onExit}
              className="flex-1 py-4 bg-[var(--primary)] text-white font-bold rounded-xl shadow-lg hover:bg-blue-600 transition-all"
            >
              Về danh sách trò chơi
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            className={styles.button}
            onClick={() => setSoundQuiet(!soundQuiet)}
          >
            {soundQuiet ? "Bật âm thanh" : "Tắt âm thanh"}
          </button>
          <button className={styles.button} onClick={onExit}>
            Rời phòng
          </button>
        </div>
      </header>

      {/* Scoreboard bar */}
      <div className={styles.scoreboard}>
        <span className={styles.hearts} aria-label={`Còn ${currentPlayer?.lives ?? 3} mạng`}>
          {"❤️".repeat(currentPlayer?.lives ?? 3)}
          <span>{"🤍".repeat(Math.max(0, 3 - (currentPlayer?.lives ?? 3)))}</span>
        </span>
        <span className="font-bold">
          Câu {currentIndex + 1}/{room.words.length}
        </span>
        <span className="font-mono font-bold text-amber-500">
          ⏳ {timeLeft}s
        </span>
        <strong>{currentPlayer?.score ?? 0} điểm</strong>
      </div>

      {/* Arena */}
      <div className={styles.blastArena} style={{ minHeight: "440px" }}>
        {/* Vietnamese Meaning Prompt */}
        <div
          key={`prompt-${currentIndex}`}
          className={`${styles.questionEntrance} flex flex-col items-center justify-center p-6 text-center select-none`}
        >
          {winnerNotice && (
            <div className="mb-3 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm flex items-center gap-1.5 animate-pulse">
              <span>⚡</span>
              <span>
                {winnerNotice.displayName} vừa cướp điểm thành công (+{winnerNotice.points}đ)! Đang ở câu tiếp theo.
              </span>
            </div>
          )}

          <span className="text-xs uppercase tracking-widest text-[var(--muted)] font-bold mb-2">
            Tìm từ tiếng Anh có nghĩa:
          </span>
          <h3 className="text-2xl md:text-3xl font-extrabold text-[var(--ink)] max-w-xl">
            &ldquo;{currentWord?.meaning}&rdquo;
          </h3>
          {feedback && (
            <div
              className={`mt-3 font-bold text-sm px-4 py-1.5 rounded-full transition-all animate-bounce ${
                feedback.tone === "correct"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {feedback.message}
            </div>
          )}
        </div>

        {/* Floating Target Buttons OR Spectator Locked Screen */}
        {isEliminated ? (
          <div className="relative w-full h-[320px] flex flex-col items-center justify-center p-6 text-center select-none bg-red-950/10 rounded-2xl border-2 border-dashed border-red-400/50 backdrop-blur-sm mx-auto max-w-2xl my-2">
            <div className="text-6xl mb-2 animate-bounce">💀</div>
            <h3 className="text-2xl font-black text-red-600 mb-1 uppercase tracking-wide">
              BẠN ĐÃ HẾT TIM & BỊ LOẠI!
            </h3>
            <p className="text-sm font-semibold text-[var(--muted)] max-w-lg mb-4">
              Màn chọn của bạn đã bị khóa. Hãy quan sát các đối thủ còn lại tiếp tục đấu trí đến khi kết thúc trận nhé!
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
          <div
            key={`targets-${currentIndex}`}
            className={`${styles.targetsEntrance} relative w-full h-[320px] overflow-hidden`}
          >
            {currentOptions.map((opt, i) => {
              const pos = floats[i] || { x: 25 * ((i % 4) + 1) - 10, y: 35 };
              const isWrongChoice = disabledOptions.includes(opt.id);
              const isCorrectAnswer = hasAnswered && opt.id === currentWord?.id;
              const isDisabled = isWrongChoice || (hasAnswered && !isCorrectAnswer);

              return (
                <button
                  key={opt.id}
                  type="button"
                  data-nth={(i % 4) + 1}
                  data-hit={isCorrectAnswer ? "correct" : isWrongChoice ? "wrong" : undefined}
                  className={`${styles.floatingTarget} ${
                    isWrongChoice ? styles.floatingTargetWrong : ""
                  } ${isCorrectAnswer ? styles.floatingTargetCorrect : ""}`}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    opacity: isWrongChoice ? 0.3 : isDisabled && !isCorrectAnswer ? 0.4 : 1,
                    transform: "translate(-50%, -50%)",
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                  disabled={isDisabled}
                  onClick={() => handleSelectOption(opt)}
                >
                  <kbd className="opacity-60 text-[10px] mr-1.5 font-mono">{i + 1}</kbd>
                  <span className="font-bold">{opt.word}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Status bar */}
        <div className={styles.blastStatus}>
          <span>
            {players.filter((p) => p.lives > 0).length} người chơi đang chiến đấu
          </span>
          <span className="text-xs text-[var(--muted)]">
            Ai bấm đúng trước nhận tối đa +15 điểm!
          </span>
        </div>
      </div>
    </section>
  );
}
