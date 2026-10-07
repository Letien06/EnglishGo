import type { DauToeicDifficultySession } from "@/types/dautoeic";

export const PRACTICE_WINDOW_SIZE = 25;
export type PracticeWindowSession = DauToeicDifficultySession & { windowOffset?: number };

/** Only difficulty sessions are windowed; test sessions keep their existing IDs and order. */
export function selectPracticeWindow(session: DauToeicDifficultySession, requestedIndex: string | number | undefined) {
  if (!Number.isSafeInteger(session.total) || session.total < 0 || session.total !== session.items.length) throw new RangeError("Invalid practice session total.");
  const requested = Number(requestedIndex);
  const absoluteIndex = Math.max(0, Math.min(session.total - 1, Number.isFinite(requested) ? Math.trunc(requested) : 0));
  if (session.testId) return { session: session as PracticeWindowSession, initialIndex: absoluteIndex };
  const windowOffset = Math.floor(absoluteIndex / PRACTICE_WINDOW_SIZE) * PRACTICE_WINDOW_SIZE;
  return {
    session: { ...session, windowOffset, items: session.items.slice(windowOffset, windowOffset + PRACTICE_WINDOW_SIZE) } as PracticeWindowSession,
    initialIndex: absoluteIndex - windowOffset,
  };
}

export function practiceWindowInfo(session: PracticeWindowSession) {
  if (session.windowOffset === undefined) return { offset: 0, total: session.items.length };
  const offset = session.windowOffset;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % PRACTICE_WINDOW_SIZE !== 0 ||
      !Number.isSafeInteger(session.total) || session.total < offset + session.items.length ||
      session.items.length !== Math.min(PRACTICE_WINDOW_SIZE, session.total - offset)) throw new RangeError("Invalid practice window.");
  return { offset, total: session.total };
}

export function practiceNavigationTarget(session: PracticeWindowSession, localIndex: number) {
  const { offset, total } = practiceWindowInfo(session);
  const absoluteIndex = offset + localIndex;
  if (!Number.isSafeInteger(localIndex) || absoluteIndex < 0 || absoluteIndex >= total) return null;
  return { absoluteIndex, reload: localIndex < 0 || localIndex >= session.items.length };
}
