"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { VocabWordCard } from "@/types/vocab";
import { arcadeDuration, arcadeReducer, arcadeWords, createArcadeState, createFloatingTargets, rainHint, tickFloatingTarget, type ArcadeState, type FloatingTarget, type VocabularyArcadeMode, type VocabularyRoundResult } from "@/lib/vocab-arcade";
import useVocabularyAudio from "../useVocabularyAudio";
import VocabularyRain from "./VocabularyRain";
import styles from "../vocabulary.module.css";

import { GameModeSelector } from "../components/GameModeSelector";
import { GameLobby } from "../components/GameLobby";
import { MultiplayerWordBlast } from "../components/MultiplayerWordBlast";
import { MultiplayerVocabularyRain } from "../components/MultiplayerVocabularyRain";
import { getClientDb, getClientAuth } from "@/lib/firebase/client";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { COLLECTIONS } from "@/lib/firestore/collections";

export default function VocabularyArcade({
  words,
  mode,
  muted,
  suspended = false,
  setId,
  isAuthenticated = false,
  currentUserId: initialCurrentUserId = "",
  loginHref,
  enableMultiplayer = false,
  initialRoomCode,
  onComplete,
  onExit,
}: {
  words: VocabWordCard[];
  mode: VocabularyArcadeMode;
  muted: boolean;
  suspended?: boolean;
  setId?: number;
  isAuthenticated?: boolean;
  currentUserId?: string;
  loginHref?: string;
  enableMultiplayer?: boolean;
  initialRoomCode?: string;
  onComplete: (result: VocabularyRoundResult) => void;
  onExit: () => void;
}) {
  const [view, setView] = useState<"mode-select" | "solo" | "lobby" | "multiplayer">(() =>
    initialRoomCode ? "lobby" : enableMultiplayer ? "mode-select" : "solo"
  );
  const [roomCode, setRoomCode] = useState<string>(() => initialRoomCode || "");
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    if (initialCurrentUserId) return initialCurrentUserId;
    try {
      return getClientAuth().currentUser?.uid || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (initialCurrentUserId) setCurrentUserId(initialCurrentUserId);
  }, [initialCurrentUserId]);
  const [lobbyRoom, setLobbyRoom] = useState<any>(null);
  const [lobbyPlayers, setLobbyPlayers] = useState<any[]>([]);
  const [loadingRoom, setLoadingRoom] = useState(false);

  const [initialState, setInitialState] = useState<ArcadeState | null>(null);
  const [roundKey, setRoundKey] = useState(0);
  const [untimed, setUntimed] = useState(false);
  const [quiet, setQuiet] = useState(muted);
  const [wordLimit, setWordLimit] = useState<number | "all">("all");
  const title = mode === "blast" ? "Word Blast" : "Mưa từ vựng";
  const soundLabel = mode === "blast" ? "âm thanh" : "phát âm";

  const startSoloRound = (limit = wordLimit) => {
    setRoundKey((k) => k + 1);
    setInitialState(
      createArcadeState(
        mode,
        words,
        untimed,
        limit === "all" ? undefined : limit
      )
    );
  };

  // Fetch authenticated session user ID only when multiplayer is enabled
  useEffect(() => {
    if (!enableMultiplayer) return;
    try {
      fetch("/api/auth/session")
        .then((r) => r.json())
        .then((res) => {
          if (res?.data?.uid) setCurrentUserId(res.data.uid);
        })
        .catch(() => {});

      fetch("/api/app/session")
        .then((r) => r.json())
        .then((res) => {
          if (res?.data?.user?.uid) setCurrentUserId(res.data.user.uid);
        })
        .catch(() => {});
    } catch {}
  }, [enableMultiplayer]);

  // Handle URL room param if someone opens link with ?room=XYZ
  useEffect(() => {
    const code =
      initialRoomCode ||
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase()
        : null);
    if (code && code.length === 6) {
      setRoomCode(code);
      handleJoinRoom(code);
    }
  }, [initialRoomCode]);

  // Lobby realtime syncing via Firestore listener and polling fallback
  useEffect(() => {
    if (view !== "lobby" || !roomCode) return;

    let unsubRoom: (() => void) | null = null;
    let unsubPlayers: (() => void) | null = null;

    try {
      const db = getClientDb();
      unsubRoom = onSnapshot(doc(db, COLLECTIONS.gameRooms, roomCode), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setLobbyRoom(data);
          if (data.status === "playing") {
            setView("multiplayer");
          }
        }
      });

      unsubPlayers = onSnapshot(
        collection(db, COLLECTIONS.gameRooms, roomCode, "players"),
        (snap) => {
          const list: any[] = [];
          snap.forEach((d) => list.push(d.data()));
          if (list.length > 0) setLobbyPlayers(list);
        },
      );
    } catch {}

    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/vocab/game-room?code=${roomCode}`);
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.room) {
            setLobbyRoom(json.data.room);
            if (json.data.room.status === "playing") {
              setView("multiplayer");
            }
          }
          if (json.data.players) setLobbyPlayers(json.data.players);
          if (json.data.currentUserId) setCurrentUserId(json.data.currentUserId);
        }
      } catch {}
    }, 1200);

    return () => {
      if (unsubRoom) unsubRoom();
      if (unsubPlayers) unsubPlayers();
      window.clearInterval(interval);
    };
  }, [view, roomCode]);

  const handleCreateRoom = async () => {
    if (!isAuthenticated) {
      if (loginHref) window.location.href = loginHref;
      else alert("Vui lòng đăng nhập để chơi đối kháng với bạn bè!");
      return;
    }
    setLoadingRoom(true);
    try {
      const res = await fetch("/api/vocab/game-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vocabSetId: setId || 1,
          gameMode: mode,
          words,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "Không thể tạo phòng lúc này");
        return;
      }
      if (json.data?.currentUserId) setCurrentUserId(json.data.currentUserId);
      setRoomCode(json.data.code);
      setView("lobby");
    } catch {
      alert("Lỗi kết nối khi tạo phòng");
    } finally {
      setLoadingRoom(false);
    }
  };

  const handleJoinRoom = async (code: string) => {
    if (!isAuthenticated) {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("mode", mode);
        url.searchParams.set("tab", "play");
        url.searchParams.set("room", code);
        const targetLogin = loginHref || `/login?redirect=${encodeURIComponent(url.toString())}`;
        window.location.href = targetLogin;
      }
      return;
    }
    setLoadingRoom(true);
    try {
      const res = await fetch("/api/vocab/game-room/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "Mã phòng không tồn tại hoặc phòng đã đầy");
        setView(enableMultiplayer ? "mode-select" : "solo");
        return;
      }
      if (json.data?.currentUserId) setCurrentUserId(json.data.currentUserId);
      if (json.data?.gameMode) {
        setLobbyRoom((prev: any) => ({ ...prev, gameMode: json.data.gameMode }));
      }
      setRoomCode(code);
      setView("lobby");
    } catch {
      alert("Lỗi kết nối khi tham gia phòng");
      setView(enableMultiplayer ? "mode-select" : "solo");
    } finally {
      setLoadingRoom(false);
    }
  };

  const handleStartGame = async () => {
    try {
      const res = await fetch("/api/vocab/game-room/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.error || "Không thể bắt đầu game");
        return;
      }
      setLobbyRoom((prev: any) => ({
        ...prev,
        status: "playing",
        currentIndex: 0,
      }));
      setLobbyPlayers((prev) =>
        prev.map((p) => ({ ...p, status: "playing", lives: 3, score: 0 }))
      );
      setView("multiplayer");
    } catch {
      alert("Lỗi khi bắt đầu game");
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await fetch("/api/vocab/game-room/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode }),
      });
    } catch {}
    setRoomCode("");
    setView("mode-select");
  };

  // MÀN HÌNH 1: Chọn chế độ chơi (1 mình vs Bạn bè)
  if (view === "mode-select") {
    return (
      <GameModeSelector
        gameTitle={title}
        gameMode={mode}
        onPlaySolo={() => setView("solo")}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  // MÀN HÌNH 2: Phòng chờ (Lobby)
  if (view === "lobby") {
    if (loadingRoom && !lobbyRoom) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8 text-center text-ink">
          <div className="animate-spin text-4xl">⏳</div>
          <h2 className="text-xl font-bold">Đang kết nối vào phòng #{roomCode}...</h2>
          <p className="text-sm text-muted">Vui lòng chờ trong giây lát.</p>
        </div>
      );
    }
    const isHost = lobbyRoom?.hostId === currentUserId;
    const canStart = lobbyPlayers.length >= 2;
    return (
      <GameLobby
        roomCode={roomCode}
        gameMode={mode}
        players={lobbyPlayers}
        currentUserId={currentUserId}
        isHost={isHost}
        canStart={canStart}
        onStart={handleStartGame}
        onLeave={handleLeaveRoom}
      />
    );
  }

  // MÀN HÌNH 3: Đối kháng trực tiếp (Word Blast hoặc Mưa từ vựng)
  if (view === "multiplayer" && lobbyRoom) {
    const isRain = (lobbyRoom.gameMode || mode) === "rain";
    return isRain ? (
      <MultiplayerVocabularyRain
        key={`multiplayer-rain-${roomCode}-${lobbyRoom.roundStartedAt || 0}`}
        roomCode={roomCode}
        initialRoom={lobbyRoom}
        initialPlayers={lobbyPlayers}
        currentUserId={currentUserId}
        muted={quiet}
        onExit={() => {
          handleLeaveRoom();
          setView("mode-select");
        }}
        onReturnToLobby={() => {
          setLobbyRoom((prev: any) =>
            prev ? { ...prev, status: "waiting", currentIndex: 0 } : null
          );
          setLobbyPlayers((prev) =>
            prev.map((p) => ({ ...p, status: "waiting", lives: 3, score: 0 }))
          );
          setView("lobby");
        }}
      />
    ) : (
      <MultiplayerWordBlast
        key={`multiplayer-${roomCode}-${lobbyRoom.roundStartedAt || 0}`}
        roomCode={roomCode}
        initialRoom={lobbyRoom}
        initialPlayers={lobbyPlayers}
        currentUserId={currentUserId}
        muted={quiet}
        onExit={() => {
          handleLeaveRoom();
          setView("mode-select");
        }}
        onReturnToLobby={() => {
          setLobbyRoom((prev: any) =>
            prev ? { ...prev, status: "waiting", currentIndex: 0 } : null
          );
          setLobbyPlayers((prev) =>
            prev.map((p) => ({ ...p, status: "waiting", lives: 3, score: 0 }))
          );
          setView("lobby");
        }}
      />
    );
  }

  // MÀN HÌNH SOLO (Gốc)
  if (initialState) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button className={styles.button} aria-pressed={!quiet} onClick={() => setQuiet(!quiet)}>
            {quiet ? `Bật ${soundLabel}` : `Tắt ${soundLabel}`}
          </button>
        </div>
        {mode === "rain" ? (
          <VocabularyRain
            key={roundKey}
            initialState={initialState}
            muted={quiet}
            suspended={suspended}
            onComplete={onComplete}
            onExit={onExit}
            onRestart={() => startSoloRound()}
          />
        ) : (
          <ArcadeRound
            key={roundKey}
            initialState={initialState}
            muted={quiet}
            suspended={suspended}
            onComplete={onComplete}
            onExit={onExit}
            onRestart={() => startSoloRound()}
          />
        )}
      </div>
    );
  }

  const availablePool = arcadeWords(words);
  const totalCount = availablePool.length;
  const effectiveCount = wordLimit === "all" ? totalCount : Math.min(wordLimit, totalCount);

  return (
    <section className={`${styles.hero} space-y-5`}>
      <span className={styles.eyebrow}>Góc luyện phản xạ · chơi một mình</span>
      <h2>{title}</h2>
      <p>
        {mode === "blast"
          ? "Nhìn nghĩa tiếng Việt, bắn mục tiêu tiếng Anh đang bay lơ lửng. Chạm mục tiêu hoặc bấm phím 1–4; mỗi đáp án đúng nhận 10 điểm."
          : "Nhiều nghĩa tiếng Việt đang rơi! Gõ đúng từ tiếng Anh để tự bắt lấy. Đúng liên tiếp để tăng combo."}
      </p>
      <ul className="space-y-2 text-sm text-ink2">
        <li>{effectiveCount} từ mỗi lượt · 3 mạng · tốc độ tăng sau mỗi 2 từ.</li>
        <li>
          {mode === "blast"
            ? "Chọn sai hoặc để từ chạm vạch: mất 1 mạng."
            : "Gõ chưa đúng có thể thử lại. Để từ chạm vạch: mất 1 mạng; đáp án hiện để bạn ôn lại."}
        </li>
        {mode === "rain" && (
          <li>
            Gợi ý xuất hiện ở 40% và 70% thời gian: 15 → 10 → 5 điểm. Mỗi 3 câu đúng liên tiếp tăng hệ số, tối đa x4.
          </li>
        )}
        <li>Tự tạm dừng khi chuyển tab. Từ sai được giữ trong nhóm cần ôn khi lưu cuối lượt.</li>
      </ul>
      {totalCount > 20 && (
        <div className="space-y-2">
          <span className="text-sm font-semibold text-ink block">Số lượng từ lượt chơi:</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                wordLimit === "all"
                  ? "bg-sky-500 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-700"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
              onClick={() => setWordLimit("all")}
            >
              Tất cả ({totalCount} từ)
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                wordLimit === 20
                  ? "bg-sky-500 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-700"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
              onClick={() => setWordLimit(20)}
            >
              20 từ (Chơi nhanh)
            </button>
            {totalCount > 50 && (
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  wordLimit === 50
                    ? "bg-sky-500 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-700"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
                onClick={() => setWordLimit(50)}
              >
                50 từ
              </button>
            )}
          </div>
        </div>
      )}
      <label className="flex items-center gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={untimed}
          onChange={(event) => setUntimed(event.target.checked)}
          className="h-5 w-5"
        />
        Không giới hạn thời gian (luyện nhẹ nhàng)
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          className={`${styles.button} ${styles.primary}`}
          disabled={!totalCount}
          onClick={() => startSoloRound()}
        >
          Bắt đầu chơi
        </button>
        {enableMultiplayer && (
          <button className={styles.button} onClick={() => setView("mode-select")}>
            ← Chọn chế độ khác
          </button>
        )}
        <button className={styles.button} onClick={onExit}>
          Quay lại
        </button>
      </div>
      {!totalCount && <p role="status">Bộ hiện tại chưa có từ và nghĩa để chơi.</p>}
    </section>
  );
}

/* ---- Fail buzzer sound effect via Web Audio API ---- */
function playFailSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(300, ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => ctx.close();
  } catch { /* audio not available */ }
}

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(523, ctx.currentTime);
    oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);
    oscillator.onended = () => ctx.close();
  } catch { /* audio not available */ }
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

function ArcadeRound({ initialState, muted, suspended, onComplete, onExit, onRestart }: {
  initialState: ArcadeState;
  muted: boolean;
  suspended: boolean;
  onComplete: (result: VocabularyRoundResult) => void;
  onExit: () => void;
  onRestart?: () => void;
}) {
  const [state, dispatch] = useReducer(arcadeReducer, initialState);
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const falling = useRef<HTMLDivElement>(null);
  const [travel, setTravel] = useState(140);
  const [aim, setAim] = useState(0);
  const [shot, setShot] = useState<number | null>(null);
  const [hoveredOptionId, setHoveredOptionId] = useState<number | null>(null);
  const finished = useRef(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const { speakWord, stop } = useVocabularyAudio();
  const word = state.words[state.index];
  const duration = arcadeDuration(state.index);
  const fraction = Math.min(1, state.elapsed / duration);
  const done = state.lives <= 0 || state.index + 1 >= state.words.length;

  // ---- Floating targets state ----
  const [floats, setFloats] = useState<FloatingTarget[]>(() =>
    createFloatingTargets(state.options[0]?.length ?? 4)
  );
  const prevIndex = useRef(state.index);

  // Reset floating positions when moving to next question
  useEffect(() => {
    if (state.index !== prevIndex.current) {
      prevIndex.current = state.index;
      setFloats(createFloatingTargets(state.options[state.index]?.length ?? 4));
    }
  }, [state.index, state.options]);

  // Reset hovered target when moving to next question or if target gets disabled
  useEffect(() => {
    setHoveredOptionId(null);
  }, [state.index]);

  useEffect(() => {
    if (hoveredOptionId !== null && state.disabled.includes(hoveredOptionId)) {
      setHoveredOptionId(null);
    }
  }, [state.disabled, hoveredOptionId]);

  // Dynamically track hovered floating target as it moves with rAF
  useEffect(() => {
    if (hoveredOptionId === null || suspended || state.paused || state.phase !== "playing" || state.mode !== "blast") return;
    const idx = state.options[state.index]?.findIndex((opt) => opt.id === hoveredOptionId) ?? -1;
    const f = idx >= 0 ? floats[idx] : null;
    if (f && field.current) {
      setAim(getAngleToTarget(f.x, f.y, field.current));
    }
  }, [floats, hoveredOptionId, state.index, state.options, state.phase, state.paused, suspended, state.mode]);

  // Animate floating targets with requestAnimationFrame
  useEffect(() => {
    if (suspended || state.paused || state.phase !== "playing" || state.mode !== "blast") return;
    let rafId: number;
    let lastTime = performance.now();
    function animate(now: number) {
      const delta = Math.min(now - lastTime, 200); // cap at 200ms to avoid huge jumps
      lastTime = now;
      setFloats(prev => prev.map(f => tickFloatingTarget(f, delta)));
      rafId = requestAnimationFrame(animate);
    }
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [state.paused, state.phase, state.mode, state.index, suspended]);

  const prevAnswerCount = useRef(state.answers.length);
  useEffect(() => {
    if (state.answers.length > prevAnswerCount.current) {
      const latest = state.answers[state.answers.length - 1];
      if (!muted) {
        if (latest.correct) {
          playSuccessSound();
        } else {
          // Play fail buzzer
          playFailSound();
        }
      }
    }
    prevAnswerCount.current = state.answers.length;
  }, [state.answers, muted]);

  // Auto-advance after feedback
  useEffect(() => {
    if (suspended || state.paused || state.phase !== "feedback") return;
    if (state.lives <= 0) return; // handled by showGameOver
    const delay = state.lastCorrect ? 1000 : 2200;
    const timer = window.setTimeout(() => {
      stop();
      if (done) {
        if (!finished.current) {
          finished.current = true;
          onComplete({ answers: state.answers, score: state.score });
        }
      } else {
        setTyped("");
        setShot(null);
        dispatch({ type: "next" });
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.paused, state.lastCorrect, state.index, state.lives, suspended, done, stop, onComplete, state.answers, state.score]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (field.current && falling.current) setTravel(Math.max(0, field.current.clientHeight - falling.current.offsetHeight - 72));
    });
    if (field.current) observer.observe(field.current);
    if (falling.current) observer.observe(falling.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function hide() { if (document.hidden) { dispatch({ type: "pause", paused: true }); stop(); } }
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", hide);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("blur", hide); };
  }, [stop]);

  useEffect(() => {
    if (suspended || state.paused || state.phase !== "playing" || state.untimed) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.hidden) { dispatch({ type: "pause", paused: true }); return; }
      dispatch({ type: "tick", delta: now - previous });
      previous = now;
    }, 100);
    return () => window.clearInterval(timer);
  }, [state.paused, state.phase, state.untimed, state.index, suspended]);

  useEffect(() => {
    if (suspended || state.paused || state.phase !== "playing" || state.mode !== "blast") return;
    function answerWithKey(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !/^[1-4]$/.test(event.key)) return;
      const option = state.options[state.index][Number(event.key) - 1];
      if (option) { event.preventDefault(); setShot(option.id); dispatch({ type: "answer", value: option.word, optionId: option.id }); }
    }
    window.addEventListener("keydown", answerWithKey);
    return () => window.removeEventListener("keydown", answerWithKey);
  }, [state.mode, state.paused, state.phase, state.options, state.index, suspended]);

  useEffect(() => {
    if (state.phase === "feedback") continueButton.current?.focus({ preventScroll: true });
  }, [state.phase]);

  useEffect(() => {
    if (!state.paused && state.phase === "playing" && state.mode === "rain") input.current?.focus({ preventScroll: true });
  }, [state.paused, state.phase, state.mode, state.index]);

  // Show game over overlay when lives reach 0
  useEffect(() => {
    if (state.lives <= 0 && state.phase === "feedback" && !showGameOver) {
      const timer = window.setTimeout(() => setShowGameOver(true), 800);
      return () => window.clearTimeout(timer);
    }
  }, [state.lives, state.phase, showGameOver]);

  function next() {
    stop();
    if (done) {
      if (state.lives <= 0) return;
      if (finished.current) return;
      finished.current = true;
      onComplete({ answers: state.answers, score: state.score });
    } else { setTyped(""); setShot(null); dispatch({ type: "next" }); }
  }

  function handleRestart() {
    stop();
    setShowGameOver(false);
    if (onRestart) {
      onRestart();
    } else {
      window.location.reload();
    }
  }

  // ---- Game Over overlay ----
  if (showGameOver) {
    const wrongAnswers = state.answers.filter(a => !a.correct);
    const correctCount = state.answers.filter(a => a.correct).length;
    const maxCombo = state.combo;
    return <section className={styles.arcadeRound} aria-label="Game Over">
      <div className={`${styles.arcade} ${styles.blastArena}`}>
        <div className={styles.gameOverOverlay}>
          <div className={styles.gameOverIcon} aria-hidden="true">💥</div>
          <h2 className={styles.gameOverTitle}>GAME OVER</h2>
          <p className={styles.gameOverSubtitle}>SCORE: {state.score} // LEVEL: {Math.floor(state.index / 2) + 1}</p>

          <div className={styles.gameOverStats}>
            <div className={styles.gameOverStat}>
              <span className={styles.gameOverStatIcon}>🎯</span>
              <strong>{state.score}</strong>
              <small>PTS</small>
            </div>
            <div className={styles.gameOverStat}>
              <span className={styles.gameOverStatIcon}>⚡</span>
              <strong>{correctCount}</strong>
              <small>HIT</small>
            </div>
            <div className={styles.gameOverStat}>
              <span className={styles.gameOverStatIcon}>🔥</span>
              <strong>x{Math.max(1, maxCombo)}</strong>
              <small>MAX</small>
            </div>
          </div>

          {wrongAnswers.length > 0 && <>
            <h3 className={styles.gameOverReviewTitle}>&gt; TỪ CẦN ÔN ({wrongAnswers.length})</h3>
            <div className={styles.gameOverWordList}>
              {wrongAnswers.map((a, i) => (
                <div key={`${a.item.id}-${i}`} className={styles.gameOverWordRow}>
                  <strong>{a.item.word}</strong>
                  <span>{a.item.meaning}</span>
                </div>
              ))}
            </div>
          </>}

          <div className={styles.gameOverActions}>
            <button className={`${styles.button} ${styles.primary}`} onClick={handleRestart}>↻ THỬ LẠI</button>
            <button className={styles.button} onClick={onExit}>Thoát</button>
          </div>
        </div>
      </div>
    </section>;
  }

  const hoveredIndex = hoveredOptionId !== null ? state.options[state.index]?.findIndex((opt) => opt.id === hoveredOptionId) ?? -1 : -1;
  const hoveredFloat = hoveredIndex >= 0 ? floats[hoveredIndex] : null;

  return <section className={styles.arcadeRound} aria-label={state.mode === "blast" ? "Word Blast" : "Mưa từ vựng"}>
    <div className={styles.toolbar}><h2 className="text-xl font-bold text-ink">{state.mode === "blast" ? "Word Blast" : "Mưa từ vựng"}</h2><div className="flex gap-2"><button className={styles.button} onClick={() => dispatch({ type: "pause", paused: !state.paused })}>{state.paused ? "Tiếp tục chơi" : "Tạm dừng"}</button><button className={styles.button} onClick={onExit}>Thoát</button></div></div>
    <div className={`${styles.arcade} ${styles.blastArena}`}>
      <div className={styles.scoreboard}><span className={styles.hearts} aria-label={`Còn ${state.lives} mạng`}>{"🔥".repeat(state.lives)}<span>{"💀".repeat(3 - state.lives)}</span></span><span>Mốc {Math.floor(state.index / 2) + 1} · {state.index + 1}/{state.words.length}</span><span>{state.score} điểm{state.mode === "rain" && ` · Combo ${state.combo}`}</span></div>
      <div className={styles.blastClue}><p>&gt; FIND THE WORD</p>{state.mode === "blast" && <h3>{word.meaning}</h3>}<small>{state.untimed ? "Không giới hạn thời gian" : `Còn ${Math.ceil((duration - state.elapsed) / 1000)} giây`}</small></div>
      <div
        ref={field}
        className={styles.field}
        data-paused={state.paused || suspended}
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
        {state.mode === "blast" ? <>
          {state.options[state.index].map((option, index) => {
            const f = floats[index];
            const isHovered = hoveredOptionId === option.id;
            return <button
              key={`${state.index}-${option.id}`}
              className={styles.floatingTarget}
              data-hit={shot === option.id ? (state.lastCorrect ? "correct" : "wrong") : undefined}
              data-nth={index + 1}
              data-targeted={isHovered ? "true" : undefined}
              style={{
                left: `${f?.x ?? 25}%`,
                top: `${f?.y ?? 25}%`,
              }}
              disabled={suspended || state.paused || state.phase === "feedback" || state.disabled.includes(option.id)}
              onClick={() => {
                setShot(option.id);
                if (f && field.current) {
                  setAim(getAngleToTarget(f.x, f.y, field.current));
                }
                dispatch({ type: "answer", value: option.word, optionId: option.id });
              }}
              onPointerEnter={() => {
                if (state.phase === "playing" && !state.disabled.includes(option.id)) {
                  setHoveredOptionId(option.id);
                  if (f && field.current) {
                    setAim(getAngleToTarget(f.x, f.y, field.current));
                  }
                }
              }}
              onPointerLeave={() => {
                setHoveredOptionId((prev) => (prev === option.id ? null : prev));
              }}
            >
              <kbd>{index + 1}</kbd>{option.word}
              <span className={styles.reticle} aria-hidden="true">
                <svg viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="8" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="16" y1="2" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="16" y1="23" x2="16" y2="30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="2" y1="16" x2="9" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="22" y1="16" x2="29" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                </svg>
              </span>
              {shot === option.id && <span key={state.answers.length} className={styles.hitBurst} aria-hidden="true">{state.lastCorrect ? "✦" : "×"}</span>}
            </button>;
          })}
        </> : <div ref={falling} className={styles.drop} style={{ transform: `translateY(${12 + fraction * travel}px)` }}><strong>{word.meaning}</strong><span aria-label="Gợi ý chữ">{rainHint(word.word, fraction)}</span></div>}
        {state.mode === "blast" && hoveredFloat && state.phase === "playing" && !state.paused && !suspended && (
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
        <div className={styles.ground} />
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
        {shot !== null && <div key={`${state.index}-${state.answers.length}`} className={styles.shotBeam} style={{ rotate: `${aim}deg` }} aria-hidden="true" />}
        {state.paused && <div className={styles.pause}><h3 className="text-2xl font-bold">Đã tạm dừng</h3><p className="text-sm text-muted">Thời gian và mạng được giữ nguyên.</p><button className={`${styles.button} ${styles.primary}`} onClick={() => dispatch({ type: "pause", paused: false })}>Tiếp tục chơi</button></div>}
      </div>
      <div className={styles.progress}><span style={{ transform: `scaleX(${1 - fraction})` }} /></div>
      <div className={styles.blastStatus}>
        <span>{state.answers.filter(a => a.correct).length} HIT // {state.options[state.index]?.length ?? 4} TARGETS</span>
      </div>
    </div>
    <p className={styles.arcadeHelp}>Chạm mục tiêu hoặc bấm 1–4 · Đúng +10 điểm · Tự chuyển sang từ tiếp theo</p>
    {state.mode === "rain" && <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); dispatch({ type: "answer", value: typed }); }}>
      <input ref={input} className={styles.input} aria-label="Từ tiếng Anh" placeholder="Gõ từ tiếng Anh..." value={typed} disabled={state.paused || state.phase === "feedback"} autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(event) => setTyped(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setTyped(""); }} />
      <button className={`${styles.button} ${styles.primary}`} disabled={!typed.trim() || state.paused || state.phase === "feedback"}>Gửi</button>
    </form>}
    {state.notice && (state.mode !== "blast" || state.lastCorrect) && (
      <div className={state.lastCorrect ? styles.success : styles.error} role="status">
        <p>
          {state.notice}
          {done && state.lives > 0 ? " · Đang mở bảng kết quả..." : ""}
        </p>
        {state.phase === "feedback" && <p className="mt-1 text-sm">{word.word} — {word.meaning}</p>}
      </div>
    )}
    {state.phase === "feedback" && !showGameOver && state.lives > 0 && (
      <div className="flex flex-wrap gap-2">
        <button
          ref={continueButton}
          className={`${styles.button} ${styles.primary}`}
          disabled={state.paused}
          onClick={next}
        >
          {done ? "Xem kết quả →" : "Từ tiếp theo →"}
        </button>
        <button className={styles.button} onClick={() => speakWord(word)}>
          Nghe lại
        </button>
      </div>
    )}
  </section>;
}
