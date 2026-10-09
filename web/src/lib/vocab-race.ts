import type { VocabWordCard } from "@/types/vocab";
import { normalizeVocabularyAnswer } from "./vocab-content";

export const RACE_MATCH_MS = 120_000;
export const RACE_FEEDBACK_MS = 200;
export const RACE_RAIN_DROP_MS = 13_000;
export type RaceDrop = { index: number; lane: number; spawnAt: number };
export type RaceEvent = { seq: number; type: "answer" | "timeout" | "finish"; questionIndex: number; selected?: string; at: number };
export interface RaceRoom {
  code: string;
  hostId: string;
  gameMode: "blast" | "rain";
  status: "waiting" | "countdown" | "playing" | "finished";
  words: VocabWordCard[];
  raceVersion?: number;
  runId?: string;
  countdownEndsAt?: number;
  matchEndsAt?: number;
  questionDurationMs?: number;
  serverNow?: number;
  updatedAt?: number;
  currentIndex?: number;
  playerSummaries?: Array<Partial<RacePlayer> & { uid: string }>;
}
export interface RacePlayer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  isHost: boolean;
  score: number;
  lives: number;
  combo: number;
  status: "waiting" | "playing" | "eliminated" | "finished";
  runId: string;
  revision: number;
  currentIndex: number;
  questionStartedAt: number;
  correctCount: number;
  maxCombo: number;
  disabledAnswers: string[];
  activeDrops: RaceDrop[];
  nextIndex: number;
  updatedAt?: number;
}

export function raceComboMultiplier(combo: number): number {
  return Math.min(4, 1 + Math.floor(Math.max(0, combo - 1) / 3));
}
export function racePoints(combo: number): number { return 10 * raceComboMultiplier(combo); }
export function compareRacePlayers(a: Pick<RacePlayer, "score" | "correctCount">, b: Pick<RacePlayer, "score" | "correctCount">): number {
  return b.score - a.score || b.correctCount - a.correctCount;
}
export function createRacePlayer(base: Partial<RacePlayer> & { uid: string }, room: RaceRoom): RacePlayer {
  const start = room.countdownEndsAt ?? room.serverNow ?? Date.now();
  const activeDrops: RaceDrop[] = room.gameMode === "rain" ? room.words.slice(0, 2).map((_, index) => ({ index, lane: index, spawnAt: start + index * 3_800 })) : [];
  return {
    uid: base.uid, displayName: base.displayName ?? "Người chơi", photoURL: base.photoURL ?? null, isHost: base.isHost ?? base.uid === room.hostId,
    runId: room.runId ?? "", revision: 0, score: 0, lives: 3, combo: 0, correctCount: 0, maxCombo: 0,
    status: room.status === "waiting" ? "waiting" : room.words.length ? "playing" : "finished",
    currentIndex: 0, questionStartedAt: start, disabledAnswers: [], activeDrops, nextIndex: activeDrops.length,
  };
}

/** The same deterministic transition predicts local play and verifies server scoring. */
export function advanceRacePlayer(player: RacePlayer, event: RaceEvent, words: VocabWordCard[], mode: "blast" | "rain", questionDurationMs = 5_000): RacePlayer {
  if (event.seq <= player.revision) return player;
  if (event.seq !== player.revision + 1) throw new RangeError("Answer sequence has a gap.");
  const next = { ...player, revision: event.seq, updatedAt: event.at };
  if (player.status !== "playing") return next;
  if (event.type === "finish") return { ...next, status: "finished", activeDrops: [] };
  const drop = mode === "rain" ? player.activeDrops.find((value) => value.index === event.questionIndex) : undefined;
  if (mode === "rain" ? !drop : event.questionIndex !== player.currentIndex) return next;
  const word = words[event.questionIndex];
  if (!word) throw new RangeError("Question is outside the word set.");
  const startedAt = drop?.spawnAt ?? player.questionStartedAt;
  const duration = mode === "rain" ? RACE_RAIN_DROP_MS : questionDurationMs;
  if (event.at < startedAt) throw new RangeError("Question has not started.");
  const expired = event.at >= startedAt + duration;
  if (event.type === "timeout" && !expired) throw new RangeError("Question has not expired.");
  const selected = normalizeVocabularyAnswer(event.selected ?? "");
  const correct = event.type === "answer" && !expired && selected === normalizeVocabularyAnswer(word.word);
  if (correct) {
    next.combo = player.combo + 1;
    next.score = player.score + racePoints(next.combo);
    next.correctCount = player.correctCount + 1;
    next.maxCombo = Math.max(player.maxCombo, next.combo);
  } else {
    if (mode === "blast" && !expired && player.disabledAnswers.includes(selected)) return next;
    next.combo = 0;
    if (expired || mode === "blast") next.lives = Math.max(0, player.lives - 1);
    if (!expired && mode === "blast") next.disabledAnswers = [...player.disabledAnswers, selected];
  }
  if (correct || expired) {
    if (mode === "blast") {
      next.currentIndex = player.currentIndex + 1;
      next.questionStartedAt = event.at + RACE_FEEDBACK_MS;
      next.disabledAnswers = [];
    } else {
      next.activeDrops = player.activeDrops.filter((value) => value.index !== event.questionIndex);
      if (player.nextIndex < words.length && next.lives > 0) {
        next.activeDrops = [...next.activeDrops, { index: player.nextIndex, lane: drop!.lane, spawnAt: event.at + RACE_FEEDBACK_MS }];
        next.nextIndex = player.nextIndex + 1;
      }
      next.currentIndex = next.activeDrops.length ? Math.min(...next.activeDrops.map((value) => value.index)) : words.length;
    }
  }
  if (next.lives <= 0) next.status = "eliminated";
  else if (mode === "blast" ? next.currentIndex >= words.length : next.activeDrops.length === 0) next.status = "finished";
  if (next.status !== "playing") next.activeDrops = [];
  return next;
}
