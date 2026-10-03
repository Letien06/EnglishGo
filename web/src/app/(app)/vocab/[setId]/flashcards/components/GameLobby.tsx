"use client";

import React, { useState } from "react";

interface GameLobbyProps {
  roomCode: string;
  gameMode: "blast" | "rain";
  players: Array<{ uid: string; displayName: string; photoURL: string | null; isHost: boolean; }>;
  currentUserId: string;
  isHost: boolean;
  canStart: boolean; // true when 2+ players
  onStart: () => void;
  onLeave: () => void;
}

export function GameLobby({
  roomCode,
  gameMode,
  players,
  currentUserId,
  isHost,
  canStart,
  onStart,
  onLeave,
}: GameLobbyProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  
  const gameTitle = gameMode === "blast" ? "Word Blast" : "Mưa từ vựng";
  
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };
  
  const handleCopyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomCode);
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  return (
    <div className="flex flex-col w-full rounded-2xl overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* Top bar */}
      <header className="flex justify-between items-center px-4 py-3.5 bg-[var(--surface)] border-b border-[var(--line)]">
        <button 
          type="button"
          onClick={onLeave}
          className="px-3.5 py-1.5 text-[var(--ink2)] hover:text-[var(--ink)] hover:bg-[var(--surface-soft)] font-semibold rounded-xl border border-[var(--line)] transition-all flex items-center gap-1.5 text-sm"
        >
          ← Rời phòng
        </button>
        <div className="font-bold text-[var(--ink)] text-sm sm:text-base flex items-center gap-2">
          <span>Game:</span>
          <span className="text-amber-400">{gameTitle}</span>
          <span>🔊</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row gap-6 max-w-6xl mx-auto w-full">
        {/* Left Panel */}
        <div className="flex-1 bg-[var(--surface)] p-6 sm:p-8 rounded-2xl border border-[var(--line)] shadow-xl flex flex-col items-center text-center">
          <span className="text-xs font-black uppercase tracking-widest text-amber-400 mb-2">
            MÃ PHÒNG
          </span>
          <div className="text-5xl sm:text-6xl font-mono font-black tracking-widest text-amber-400 mb-6 drop-shadow-[0_2px_12px_rgba(245,158,11,0.2)] select-all">
            {roomCode}
          </div>
          
          <div className="w-52 h-52 bg-white rounded-2xl p-3 shadow-lg border-2 border-amber-400/30 flex items-center justify-center mb-6 overflow-hidden">
            {typeof window !== "undefined" ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  `${window.location.origin}${window.location.pathname}?room=${roomCode}`
                )}`}
                alt={`QR Code phòng ${roomCode}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-slate-800 text-sm font-semibold">QR Code</div>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <button 
              type="button"
              onClick={handleCopyCode}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 border shadow-sm active:scale-95 cursor-pointer ${
                copiedCode
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500"
                  : "bg-[var(--surface-soft)] text-[var(--ink)] border-[var(--line)] hover:border-amber-400 hover:text-amber-300"
              }`}
            >
              <span>{copiedCode ? "✓" : "📋"}</span>
              <span>{copiedCode ? "Đã chép mã!" : "Sao chép mã"}</span>
            </button>
            <button 
              type="button"
              onClick={handleCopyLink}
              className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 border shadow-sm active:scale-95 cursor-pointer ${
                copiedLink
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500"
                  : "bg-[var(--surface-soft)] text-[var(--ink)] border-[var(--line)] hover:border-amber-400 hover:text-amber-300"
              }`}
            >
              <span>{copiedLink ? "✓" : "🔗"}</span>
              <span>{copiedLink ? "Đã chép link!" : "Sao chép link"}</span>
            </button>
          </div>
          
          <p className="text-xs sm:text-sm text-[var(--ink2)] mt-5 text-center font-medium max-w-xs">
            Gửi mã hoặc quét QR cho bạn bè cùng vào. Tối đa 5 người / phòng.
          </p>
        </div>

        {/* Right Panel */}
        <div className="flex-1 bg-[var(--surface)] p-6 sm:p-8 rounded-2xl border border-[var(--line)] shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--line)]">
            <h2 className="text-lg sm:text-xl font-extrabold text-[var(--ink)] flex items-center gap-2">
              <span>👥</span> Người chơi trong phòng
            </h2>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {players.length}/5 người
            </span>
          </div>
          
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto mb-6">
            {players.map((player) => {
              const isSelf = player.uid === currentUserId;
              return (
                <div 
                  key={player.uid} 
                  className={`flex items-center gap-3.5 p-3.5 sm:p-4 rounded-xl border transition-all ${
                    isSelf
                      ? "bg-[var(--surface-soft)] border-amber-400/50 shadow-md ring-1 ring-amber-400/30 text-[var(--ink)]"
                      : "bg-[var(--surface-soft)]/60 border-[var(--line)] text-[var(--ink)]"
                  }`}
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-lg flex items-center justify-center shadow flex-shrink-0 overflow-hidden">
                    {player.photoURL ? (
                      <img src={player.photoURL} alt={player.displayName} className="w-full h-full object-cover" />
                    ) : (
                      player.displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0 font-bold text-base flex items-center gap-2">
                    <span className="truncate text-[var(--ink)]">{player.displayName}</span>
                    {isSelf && (
                      <span className="text-[11px] font-extrabold text-amber-400 bg-amber-400/15 px-2 py-0.5 rounded-full border border-amber-400/30 flex-shrink-0">
                        Bạn
                      </span>
                    )}
                  </div>
                  {player.isHost && (
                    <div className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black rounded-lg uppercase tracking-wider flex-shrink-0">
                      HOST
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => (
              <div 
                key={`empty-${i}`} 
                className="flex items-center gap-3.5 p-3.5 sm:p-4 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-soft)]/20"
              >
                <div className="w-11 h-11 rounded-full border border-dashed border-[var(--line)] flex items-center justify-center text-[var(--muted)] text-xl font-bold bg-[var(--surface)]/50 flex-shrink-0">
                  +
                </div>
                <div className="text-[var(--muted)] text-sm font-semibold italic">
                  Đang chờ người chơi tham gia...
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-4 border-t border-[var(--line)]">
            {isHost ? (
              <button
                type="button"
                onClick={onStart}
                disabled={!canStart}
                className={`w-full py-4 rounded-xl font-black text-base sm:text-lg transition-all flex justify-center items-center gap-2 shadow-md ${
                  canStart
                    ? "bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/25 cursor-pointer active:scale-98"
                    : "bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--muted)] cursor-not-allowed opacity-80"
                }`}
              >
                <span>▶</span>
                <span>{canStart ? "Bắt đầu trận đấu" : "Bắt đầu game (Cần tối thiểu 2 người)"}</span>
              </button>
            ) : (
              <div className="w-full py-4 bg-[var(--surface-soft)] border border-[var(--line)] text-[var(--ink2)] font-bold text-base rounded-xl text-center flex items-center justify-center gap-2">
                <span>⏳</span>
                <span>Chờ chủ phòng bắt đầu trận đấu...</span>
              </div>
            )}
            <p className="text-center text-xs font-semibold text-[var(--muted)] mt-3">
              {canStart
                ? "Phòng đã đủ điều kiện, chủ phòng có thể bắt đầu!"
                : `Cần tối thiểu 2 người để chơi cùng nhau (hiện có ${players.length}/5)`}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
