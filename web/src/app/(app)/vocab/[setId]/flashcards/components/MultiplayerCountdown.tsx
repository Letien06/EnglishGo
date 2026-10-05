"use client";

import React, { useEffect, useState } from "react";

interface MultiplayerCountdownProps {
  countdownEndsAt: number;
  gameMode: "blast" | "rain";
  roomCode: string;
  players: Array<{
    uid: string;
    displayName: string;
    photoURL?: string | null;
  }>;
  currentUserId: string;
  muted?: boolean;
  onFinish?: () => void;
}

function playBeep(freq: number, duration = 0.12) {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => ctx.close();
  } catch {}
}

export function MultiplayerCountdown({
  countdownEndsAt,
  gameMode,
  roomCode,
  players,
  currentUserId,
  muted = false,
  onFinish,
}: MultiplayerCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    return Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000));
  });

  useEffect(() => {
    const checkTimer = () => {
      const remainingMs = countdownEndsAt - Date.now();
      const s = Math.max(0, Math.ceil(remainingMs / 1000));
      setSecondsLeft((prev) => {
        if (s !== prev) {
          if (!muted && s > 0) {
            playBeep(s === 1 ? 880 : 520, s === 1 ? 0.25 : 0.1);
          } else if (!muted && s === 0 && prev > 0) {
            playBeep(1046, 0.35); // High C for START!
          }
          return s;
        }
        return prev;
      });

      if (remainingMs <= 0) {
        onFinish?.();
      }
    };

    checkTimer();
    const interval = window.setInterval(checkTimer, 100);
    return () => window.clearInterval(interval);
  }, [countdownEndsAt, muted, onFinish]);

  const modeTitle = gameMode === "rain" ? "MƯA TỪ VỰNG" : "WORD BLAST";

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[520px] p-6 text-center select-none overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface-soft)] shadow-2xl backdrop-blur-md">
      {/* Background Energy Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-amber-500/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Top Banner */}
      <div className="relative z-10 mb-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-amber-400/20 text-amber-300 border border-amber-400/30">
          <span>⚡</span>
          <span>ĐỐI KHÁNG TRỰC TIẾP · PHÒNG #{roomCode}</span>
        </span>
      </div>

      <h2 className="relative z-10 text-xl sm:text-2xl font-black text-[var(--ink)] tracking-wider uppercase mb-1">
        {modeTitle}
      </h2>
      <p className="relative z-10 text-xs sm:text-sm text-[var(--muted)] font-medium mb-6">
        Máy chủ đang đồng bộ từ vựng & kết nối mọi người chơi...
      </p>

      {/* Big Animated Countdown Number */}
      <div className="relative z-10 my-4 flex items-center justify-center w-36 h-36">
        {secondsLeft > 0 ? (
          <div
            key={secondsLeft}
            className="text-7xl sm:text-8xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 drop-shadow-[0_0_35px_rgba(251,191,36,0.6)] animate-[ping_0.9s_cubic-bezier(0,0,0.2,1)]"
          >
            {secondsLeft}
          </div>
        ) : (
          <div
            key="start"
            className="text-4xl sm:text-5xl font-black tracking-widest text-emerald-400 drop-shadow-[0_0_35px_rgba(52,211,153,0.7)] animate-bounce"
          >
            CHIẾN!
          </div>
        )}
      </div>

      <p className="relative z-10 text-sm font-bold text-amber-400 mt-2 mb-6">
        {secondsLeft > 0
          ? "Chuẩn bị phản xạ nhanh để cướp điểm!"
          : "Trận đấu chính thức bắt đầu!"}
      </p>

      {/* Player Roster Ready Badges */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 max-w-md">
        {players.map((p) => {
          const isMe = p.uid === currentUserId;
          return (
            <div
              key={p.uid}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${
                isMe
                  ? "bg-amber-400/20 border-amber-400 text-amber-300 shadow-sm"
                  : "bg-[var(--surface)] border-[var(--line)] text-[var(--ink)]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{p.displayName}</span>
              {isMe && <span className="text-[10px] text-amber-400 font-black">(Bạn)</span>}
              <span className="text-emerald-400 text-[11px]">✓ Sẵn sàng</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
