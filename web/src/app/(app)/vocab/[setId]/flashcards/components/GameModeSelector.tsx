"use client";

import React, { useState } from "react";

interface GameModeSelectorProps {
  gameTitle: string; // "Word Blast" or "Mưa từ vựng"
  gameMode: "blast" | "rain";
  onPlaySolo: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
}

export function GameModeSelector({
  gameTitle,
  gameMode,
  onPlaySolo,
  onCreateRoom,
  onJoinRoom,
}: GameModeSelectorProps) {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.trim()) {
      onJoinRoom(roomCode.trim().toUpperCase());
      setShowJoinModal(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-[var(--ink)]">
      <h1 className="text-2xl sm:text-3xl font-black mb-8 text-center text-[var(--ink)]">
        {gameTitle} — Chọn chế độ chơi
      </h1>

      <div className="flex flex-col md:flex-row gap-6 w-full max-w-3xl">
        {/* Solo Card */}
        <button
          type="button"
          onClick={onPlaySolo}
          className="flex-1 flex flex-col items-center p-8 bg-[var(--surface)] border border-[var(--line)] rounded-2xl hover:border-blue-400 hover:shadow-xl transition-all group cursor-pointer"
        >
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">👤</div>
          <h2 className="text-2xl font-bold mb-2 text-[var(--ink)]">Chơi 1 mình</h2>
          <p className="text-[var(--muted)] text-center text-sm font-medium">
            Thử thách phản xạ bản thân, không giới hạn thời gian
          </p>
        </button>

        {/* Multiplayer Card */}
        <button
          type="button"
          onClick={onCreateRoom}
          className="flex-1 flex flex-col items-center p-8 bg-[var(--surface)] border-2 border-amber-400/60 rounded-2xl hover:border-amber-400 hover:shadow-xl transition-all group cursor-pointer"
        >
          <div className="text-5xl mb-4 group-hover:scale-110 transition-transform">👥</div>
          <h2 className="text-2xl font-black mb-2 text-amber-400">Chơi với bạn bè</h2>
          <p className="text-[var(--ink2)] text-center text-sm font-medium">
            Tạo phòng QR · chia sẻ link · tối đa 5 người
          </p>
        </button>
      </div>

      <div className="mt-8">
        <button
          type="button"
          onClick={() => setShowJoinModal(true)}
          className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-2 font-bold text-sm sm:text-base cursor-pointer"
        >
          <span>🔑</span> Đã có mã phòng? Tham gia ngay
        </button>
      </div>

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black mb-2 text-[var(--ink)]">Nhập mã phòng</h2>
            <p className="text-sm font-medium text-[var(--muted)] mb-6">
              Mã phòng gồm 6 ký tự (ví dụ: HVX3YP), không phân biệt hoa thường.
            </p>
            
            <form onSubmit={handleJoin}>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="VD: HVX3YP"
                maxLength={6}
                className="w-full text-center text-3xl font-mono font-black p-4 border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink)] rounded-xl mb-6 uppercase tracking-widest focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 focus:outline-none"
                autoFocus
              />
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 p-3 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--ink)] hover:bg-[var(--surface)] font-bold transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={roomCode.length !== 6}
                  className="flex-1 p-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black disabled:opacity-40 disabled:cursor-not-allowed hover:from-amber-300 hover:to-amber-400 transition-colors shadow-md cursor-pointer"
                >
                  Tham gia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
