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
    <div className="fixed top-4 right-4 bg-white/90 backdrop-blur shadow-lg border border-[var(--line)] rounded-xl overflow-hidden min-w-[240px] z-50 text-[var(--ink)]">
      <div className="bg-gray-50 border-b border-[var(--line)] px-4 py-2 font-bold text-sm flex items-center gap-2">
        🏆 Bảng điểm
      </div>
      <div className="flex flex-col">
        {sortedPlayers.map((player, index) => {
          const isCurrentUser = player.uid === currentUserId;
          return (
            <div 
              key={player.uid}
              className={`flex items-center px-4 py-2 border-b border-[var(--line)] last:border-0 ${isCurrentUser ? 'bg-blue-50/50 font-medium' : ''}`}
            >
              <div className={`w-6 text-center font-bold mr-2 ${index === 0 ? 'text-amber-500' : 'text-[var(--muted)]'}`}>
                #{index + 1}
              </div>
              <div className="flex-1 truncate mr-2">
                {player.displayName}
              </div>
              <div className="font-mono font-bold mr-4">
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
