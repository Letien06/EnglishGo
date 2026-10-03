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
  const [room, setRoom] = useState<GameRoomData>(initialRoom);
  const [players, setPlayers] = useState<GamePlayer[]>(initialPlayers);
  const [soundQuiet, setSoundQuiet] = useState(muted);
  const [disabledOptions, setDisabledOptions] = useState<number[]>([]);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: "correct" | "wrong" } | null>(null);

  const [myUid, setMyUid] = useState<string>(currentUserId);

  useEffect(() => {
    if (currentUserId && currentUserId !== myUid) {
      setMyUid(currentUserId);
    }
  }, [currentUserId]);

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
            setRoom(snap.data() as GameRoomData);
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

    // Polling fallback every 1200ms
    const pollTimer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/vocab/game-room?code=${roomCode}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.room) setRoom(json.data.room);
          if (json.data.players) setPlayers(json.data.players);
          if (json.data.currentUserId && !myUid) setMyUid(json.data.currentUserId);
        }
      } catch {
        /* Ignore transient poll errors */
      }
    }, 1200);

    return () => {
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
      window.clearInterval(pollTimer);
    };
  }, [roomCode, myUid]);

  // Current question data
  const currentIndex = room.currentIndex ?? 0;
  const currentWord = room.words[currentIndex];

  // Options for current question (deterministically seeded)
  const [currentOptions, setCurrentOptions] = useState<VocabWordCard[]>([]);
  const [floats, setFloats] = useState<FloatingTarget[]>(() => createFloatingTargets(4));

  useEffect(() => {
    if (!currentWord || !room.words?.length) return;

    // Reset round states
    setHasAnswered(false);
    setDisabledOptions([]);
    setFeedback(null);
    setTimeLeft(QUESTION_DURATION);

    // Generate options using seed
    const seed = roomCode.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) + currentIndex * 997;
    const rng = pseudoRandom(seed);
    const opts = blastOptions(currentWord, room.words, rng);
    setCurrentOptions(opts);
    setFloats(createFloatingTargets(opts.length));
  }, [currentIndex, roomCode, currentWord]);

  // Timer countdown
  useEffect(() => {
    if (room.status !== "playing") return;

    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Question expired: auto advance if host
          if (players.find((p) => p.uid === myUid)?.isHost) {
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
  }, [currentIndex, room.status, roomCode, myUid, players]);

  // Floating animation loop
  useEffect(() => {
    if (room.status !== "playing") return;

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
  }, [currentIndex, room.status]);

  const currentPlayer = players.find((p) => p.uid === myUid) || players.find((p) => p.uid === currentUserId) || players[0];
  const isEliminated = (currentPlayer?.lives ?? 3) <= 0;

  // Handle answering
  const handleSelectOption = async (option: VocabWordCard) => {
    if (hasAnswered || room.status !== "playing") return;

    const me = currentPlayer;
    if (me && me.lives <= 0) return;

    const isCorrect = option.id === currentWord.id;

    if (isCorrect) {
      setHasAnswered(true);
      setFeedback({ message: "CHÍNH XÁC! 🎯 CƯỚP ĐIỂM THÀNH CÔNG!", tone: "correct" });
      if (!soundQuiet) {
        playSuccessSound();
        window.setTimeout(() => speakWord(currentWord), 200);
      }
    } else {
      // Trả lời sai: trừ tim và không cho chơi tiếp câu này
      setHasAnswered(true);
      setDisabledOptions(currentOptions.map((o) => o.id));
      const targetUid = me?.uid || myUid;
      setPlayers((prev) =>
        prev.map((p) => (p.uid === targetUid ? { ...p, lives: Math.max(0, p.lives - 1) } : p))
      );
      const newLives = Math.max(0, (me?.lives ?? 3) - 1);
      if (newLives <= 0) {
        setFeedback({ message: "💀 BẠN ĐÃ HẾT TIM! Bạn đã bị loại khỏi trận đấu...", tone: "wrong" });
      } else {
        setFeedback({ message: `❌ TRẢ LỜI SAI! -1 TIM (Còn ${newLives}❤️). Bạn phải đợi câu tiếp theo!`, tone: "wrong" });
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
        if (json.data.advanced || json.data.nextIndex !== undefined) {
          setRoom((prev) => ({
            ...prev,
            currentIndex: json.data.nextIndex,
            status: json.data.status,
          }));
        }
        if (json.data.status === "finished") {
          setRoom((prev) => ({ ...prev, status: "finished" }));
        }
      }
    } catch (err) {
      console.error("Failed to submit answer", err);
    }
  };

  // Keyboard 1-4 shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (hasAnswered || isEliminated || room.status !== "playing") return;
      const key = parseInt(e.key, 10);
      if (key >= 1 && key <= currentOptions.length) {
        handleSelectOption(currentOptions[key - 1]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasAnswered, isEliminated, room.status, currentOptions]);

  // ---- PODIUM / VICTORY SCREEN ----
  if (room.status === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const allEliminated = players.every((p) => (p.lives ?? 3) <= 0);

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-[var(--ink)]">
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
              const isMe = p.uid === currentUserId;
              return (
                <div
                  key={p.uid}
                  className={`flex items-center justify-between p-4 rounded-xl border ${
                    isMe
                      ? "border-[var(--primary)] bg-blue-50/40 font-semibold"
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
        <div className="flex flex-col items-center justify-center p-6 text-center select-none">
          {room.lastWinner && (
            <div className="mb-3 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm flex items-center gap-1.5 animate-pulse">
              <span>⚡</span>
              <span>
                {room.lastWinner.displayName} vừa cướp điểm thành công (+{room.lastWinner.points}đ)! Đang ở câu tiếp theo.
              </span>
            </div>
          )}

          {isEliminated && (
            <div className="mb-3 bg-red-50 border border-red-300 text-red-700 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm flex items-center gap-1.5">
              <span>💀</span>
              <span>Bạn đã hết tim! Hãy quan sát các người chơi còn lại thi đấu...</span>
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

        {/* Floating Target Buttons */}
        <div className="relative w-full h-[320px] overflow-hidden">
          {currentOptions.map((opt, i) => {
            const pos = floats[i] || { x: 25 * i, y: 30 };
            const isDisabled =
              isEliminated || disabledOptions.includes(opt.id) || (hasAnswered && opt.id !== currentWord?.id);
            const isCorrectAnswer = hasAnswered && opt.id === currentWord?.id;

            return (
              <button
                key={opt.id}
                type="button"
                data-nth={i % 4}
                className={`${styles.floatingTarget} ${
                  isCorrectAnswer ? styles.targetPulseCorrect : ""
                }`}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  opacity: isDisabled && !isCorrectAnswer ? 0.35 : 1,
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
