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
      <h1 className="text-3xl font-bold mb-8 text-center">
        {gameTitle} — Chọn chế độ chơi
      </h1>

      <div className="flex flex-col md:flex-row gap-6 w-full max-w-3xl">
        {/* Solo Card */}
        <button
          onClick={onPlaySolo}
          className="flex-1 flex flex-col items-center p-8 bg-[var(--surface)] border border-[var(--line)] rounded-2xl hover:border-[var(--primary)] hover:shadow-lg transition-all"
        >
          <div className="text-5xl mb-4">👤</div>
          <h2 className="text-2xl font-semibold mb-2">Chơi 1 mình</h2>
          <p className="text-[var(--muted)] text-center">
            Thử thách bản thân, không giới hạn thời gian
          </p>
        </button>

        {/* Multiplayer Card */}
        <button
          onClick={onCreateRoom}
          className="flex-1 flex flex-col items-center p-8 bg-amber-50 border-2 border-amber-400 rounded-2xl hover:bg-amber-100 hover:shadow-lg transition-all"
        >
          <div className="text-5xl mb-4">👥</div>
          <h2 className="text-2xl font-semibold mb-2 text-amber-700">Chơi với bạn bè</h2>
          <p className="text-amber-600/80 text-center">
            Tạo phòng QR · chia sẻ link · tối đa 5 người
          </p>
        </button>
      </div>

      <div className="mt-8">
        <button
          onClick={() => setShowJoinModal(true)}
          className="text-[var(--primary)] hover:underline flex items-center gap-2"
        >
          <span>🔑</span> Đã có mã phòng? Tham gia
        </button>
      </div>

      {/* Join Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface)] rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-2xl font-bold mb-2">Nhập mã phòng</h2>
            <p className="text-[var(--muted)] mb-6">
              Mã gồm 6 ký tự, không phân biệt hoa thường.
            </p>
            
            <form onSubmit={handleJoin}>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="VD: 7HKQ4M"
                maxLength={6}
                className="w-full text-center text-3xl font-mono p-4 border border-[var(--line)] rounded-xl mb-6 uppercase focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)] focus:outline-none"
                autoFocus
              />
              
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 p-3 rounded-xl border border-[var(--line)] hover:bg-gray-50 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={roomCode.length !== 6}
                  className="flex-1 p-3 rounded-xl bg-[var(--primary)] text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
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
