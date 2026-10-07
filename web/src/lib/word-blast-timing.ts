export const WORD_BLAST_QUESTION_MS = 5_000;
export const WORD_BLAST_COUNTDOWN_MS = 3_000;
export const LEGACY_WORD_BLAST_QUESTION_MS = 7_000;

/** Running rooms without a stored duration retain their original deadline. */
export function wordBlastQuestionMs(stored?: unknown): number {
  return typeof stored === "number" && Number.isFinite(stored) && stored >= 1_000 && stored <= 60_000 ? stored : LEGACY_WORD_BLAST_QUESTION_MS;
}
export function arcadeCountdownMs(mode: "blast" | "rain"): number {
  return mode === "blast" ? WORD_BLAST_COUNTDOWN_MS : 5_000;
}
