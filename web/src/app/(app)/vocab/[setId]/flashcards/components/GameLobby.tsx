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
    <div className="flex flex-col min-h-screen bg-gray-50 text-[var(--ink)]">
      {/* Top bar */}
      <header className="flex justify-between items-center p-4 bg-white border-b border-[var(--line)]">
        <button 
          onClick={onLeave}
          className="px-4 py-2 text-[var(--muted)] hover:text-[var(--ink)] font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          ← Quay lại
        </button>
        <div className="font-semibold">
          Game: {gameTitle} 🔊
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 flex flex-col md:flex-row gap-8 max-w-6xl mx-auto w-full">
        {/* Left Panel */}
        <div className="flex-1 bg-white p-8 rounded-2xl border border-[var(--line)] shadow-sm flex flex-col items-center">
          <h2 className="text-[var(--muted)] font-semibold tracking-widest text-sm mb-2">
            MÃ PHÒNG
          </h2>
          <div className="text-6xl font-mono font-bold tracking-widest text-[var(--primary)] mb-8">
            {roomCode}
          </div>
          
          <div className="w-48 h-48 bg-white border border-[var(--line)] rounded-xl flex items-center justify-center p-2 mb-8 shadow-sm overflow-hidden">
            {typeof window !== "undefined" ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(
                  `${window.location.origin}${window.location.pathname}?room=${roomCode}`
                )}`}
                alt={`QR Code phòng ${roomCode}`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-[var(--muted)] text-sm">QR Code</div>
            )}
          </div>
          
          <div className="flex gap-4 w-full max-w-sm">
            <button 
              onClick={handleCopyCode}
              className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              📋 {copiedCode ? "Đã copy!" : "Copy mã"}
            </button>
            <button 
              onClick={handleCopyLink}
              className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              🔗 {copiedLink ? "Đã copy!" : "Copy link"}
            </button>
          </div>
          
          <p className="text-sm text-[var(--muted)] mt-6 text-center">
            Gửi mã hoặc QR cho bạn bè. Tối đa 5 người / phòng.
          </p>
        </div>

        {/* Right Panel */}
        <div className="flex-1 bg-white p-8 rounded-2xl border border-[var(--line)] shadow-sm flex flex-col">
          <h2 className="text-xl font-bold mb-6 pb-4 border-b border-[var(--line)]">
            👥 Người chơi {players.length}/5
          </h2>
          
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto mb-6">
            {players.map((player) => (
              <div 
                key={player.uid} 
                className={`flex items-center gap-4 p-4 rounded-xl ${player.uid === currentUserId ? 'bg-[var(--surface)] border border-[var(--line)]' : 'bg-gray-50'}`}
              >
                <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold text-lg flex-shrink-0 overflow-hidden">
                  {player.photoURL ? (
                    <img src={player.photoURL} alt={player.displayName} className="w-full h-full object-cover" />
                  ) : (
                    player.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 font-medium text-lg">
                  {player.displayName}
                  {player.uid === currentUserId && <span className="text-[var(--muted)] text-sm ml-2">(Bạn)</span>}
                </div>
                {player.isHost && (
                  <div className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded">
                    HOST
                  </div>
                )}
              </div>
            ))}
            
            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
                <div className="w-10 h-10 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-300">
                  +
                </div>
                <div className="text-[var(--muted)] italic">Đang chờ...</div>
              </div>
            ))}
          </div>

          <div className="mt-auto">
            {isHost ? (
              <button
                onClick={onStart}
                disabled={!canStart}
                className="w-full py-4 bg-[var(--primary)] text-white font-bold text-lg rounded-xl shadow-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
              >
                ▶ Bắt đầu game
              </button>
            ) : (
              <div className="w-full py-4 bg-gray-100 text-[var(--muted)] font-medium text-lg rounded-xl text-center">
                ⏳ Chờ Host bắt đầu...
              </div>
            )}
            <p className="text-center text-sm text-[var(--muted)] mt-4">
              Cần tối thiểu 2 người (hiện {players.length}/5)
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
