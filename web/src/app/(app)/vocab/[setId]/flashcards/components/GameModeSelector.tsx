"use client";


interface GameModeSelectorProps {
  gameTitle: string; // "Word Blast" or "Mưa từ vựng"
  onPlaySolo: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
}

export function GameModeSelector({
  gameTitle,
  onPlaySolo,
  onCreateRoom,
}: GameModeSelectorProps) {
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
            Thử thách phản xạ, có thể tắt giới hạn thời gian
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
    </div>
  );
}
