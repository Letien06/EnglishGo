"use client";

import React, { memo } from "react";

interface MultiplayerScoreboardProps {
  players: Array<{ uid: string; displayName: string; score: number; lives: number; correctCount?: number; combo?: number; status?: string; }>;
  currentUserId: string;
}

export const MultiplayerScoreboard = memo(function MultiplayerScoreboard({
  players,
  currentUserId,
}: MultiplayerScoreboardProps) {
  // Sort players by score descending
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score || (b.correctCount ?? 0) - (a.correctCount ?? 0));

  return (
    <section aria-label="Bảng xếp hạng trực tiếp" className="my-3 w-full border border-[var(--line)] rounded-xl overflow-hidden bg-[var(--surface)] text-[var(--ink)]">
      <div className="bg-[var(--surface-soft)] border-b border-[var(--line)] px-4 py-2.5 font-black text-sm flex items-center gap-2 text-amber-400">
        🏆 Bảng xếp hạng trực tiếp
      </div>
      <div className="grid gap-px bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
        {sortedPlayers.map((player, index) => {
          const isCurrentUser = player.uid === currentUserId;
          const rank = sortedPlayers.findIndex((value) => value.score === player.score && (value.correctCount ?? 0) === (player.correctCount ?? 0)) + 1;
          return (
            <div 
              key={player.uid}
              className={`flex items-center px-4 py-2 border-b border-[var(--line)] last:border-0 ${
                isCurrentUser ? 'bg-[var(--surface-soft)] border-l-4 border-l-amber-400 font-bold text-[var(--ink)]' : 'bg-[var(--surface)] text-[var(--ink2)]'
              }`}
            >
              <div className={`w-6 text-center font-black mr-2 ${index === 0 ? 'text-amber-400' : 'text-[var(--muted)]'}`}>
                #{rank}
              </div>
              <div className="flex-1 mr-2 min-w-0">
                <span className="block truncate font-semibold text-sm text-[var(--ink)]" title={player.displayName}>{player.displayName}</span>
                {isCurrentUser && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-black uppercase tracking-wider">
                    Bạn
                  </span>
                )}
                <p className="mt-0.5 text-[11px] font-normal text-[var(--muted)]">{player.correctCount ?? 0} đúng · Combo {player.combo ?? 0}{player.status === "finished" ? " · Xong" : player.status === "eliminated" ? " · Hết tim" : ""}</p>
              </div>
              <div className="font-mono font-bold mr-4 text-amber-400">
                {player.score}
              </div>
              <div className="flex gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <span key={i} className="text-sm">
                    {i < player.lives ? "❤️" : "🤍"}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
});
