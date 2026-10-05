"use client";

import React from "react";

interface MultiplayerScoreboardProps {
  players: Array<{ uid: string; displayName: string; score: number; lives: number; }>;
  currentUserId: string;
}

export function MultiplayerScoreboard({
  players,
  currentUserId,
}: MultiplayerScoreboardProps) {
  // Sort players by score descending
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="fixed top-16 right-2 sm:right-4 bg-[var(--surface)]/95 backdrop-blur-md shadow-2xl border border-[var(--line)] rounded-xl overflow-hidden min-w-[220px] max-w-[calc(100vw-1rem)] z-40 text-[var(--ink)]">
      <div className="bg-[var(--surface-soft)] border-b border-[var(--line)] px-4 py-2.5 font-black text-sm flex items-center gap-2 text-amber-400">
        🏆 Bảng xếp hạng trực tiếp
      </div>
      <div className="flex flex-col">
        {sortedPlayers.map((player, index) => {
          const isCurrentUser = player.uid === currentUserId;
          return (
            <div 
              key={player.uid}
              className={`flex items-center px-4 py-2 border-b border-[var(--line)] last:border-0 ${
                isCurrentUser ? 'bg-amber-400/15 border-l-4 border-l-amber-400 font-bold text-[var(--ink)]' : 'text-[var(--ink2)]'
              }`}
            >
              <div className={`w-6 text-center font-black mr-2 ${index === 0 ? 'text-amber-400' : 'text-[var(--muted)]'}`}>
                #{index + 1}
              </div>
              <div className="flex-1 truncate mr-2 flex items-center gap-1.5 min-w-0">
                <span className="truncate font-semibold text-sm text-[var(--ink)]">{player.displayName}</span>
                {isCurrentUser && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-black uppercase tracking-wider">
                    Bạn
                  </span>
                )}
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
    </div>
  );
}
