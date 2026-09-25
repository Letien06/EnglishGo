import type { DauToeicDifficultyLevel } from "@/types/dautoeic";
import { DAUTOEIC_SOURCE_VERSION } from "@/lib/services/dautoeic-source";

export type LearningSkill = "listening" | "reading";

export const LEARNING_LEVELS_UPDATED_EVENT = "englishgo:learning-levels-updated";
export const ACTIVE_LEARNER_UPDATED_EVENT = "englishgo:active-learner-updated";

const ACTIVE_LEARNER_KEY = "englishgo:active-learner:v1";
const LEVEL_CACHE_PREFIX = `englishgo:learning-levels:${DAUTOEIC_SOURCE_VERSION}:`;
const DIRTY_PART_PREFIX = `englishgo:learning-levels-dirty:${DAUTOEIC_SOURCE_VERSION}:`;
const CACHE_TTL_MS = 15 * 24 * 60 * 60 * 1000;

type CachedLevels = {
  savedAt: number;
  levels: DauToeicDifficultyLevel[];
};

type LearningLevelsUpdatedDetail = {
  skill: LearningSkill;
  parts: number[];
};

type ActiveLearnerUpdatedDetail = {
  uid: string | null;
};

export function activeLearnerId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ACTIVE_LEARNER_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function setActiveLearnerId(uid: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const nextUid = uid?.trim() || null;
    const previousUid = activeLearnerId();
    if (nextUid) window.localStorage.setItem(ACTIVE_LEARNER_KEY, nextUid);
    else window.localStorage.removeItem(ACTIVE_LEARNER_KEY);
    if (previousUid !== nextUid) {
      window.dispatchEvent(new CustomEvent<ActiveLearnerUpdatedDetail>(ACTIVE_LEARNER_UPDATED_EVENT, {
        detail: { uid: nextUid },
      }));
    }
  } catch {
    // Browser storage can be unavailable without blocking learning.
  }
}

export function readCachedLearningLevels(
  skill: LearningSkill,
  part: number,
  uid = activeLearnerId(),
): DauToeicDifficultyLevel[] | null {
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(levelCacheKey(uid, skill, part));
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedLevels>;
    if (
      typeof cached.savedAt !== "number" ||
      Date.now() - cached.savedAt > CACHE_TTL_MS ||
      !Array.isArray(cached.levels)
    ) {
      window.localStorage.removeItem(levelCacheKey(uid, skill, part));
      return null;
    }
    return cached.levels as DauToeicDifficultyLevel[];
  } catch {
    return null;
  }
}

export function cacheLearningLevels(
  skill: LearningSkill,
  part: number,
  levels: DauToeicDifficultyLevel[],
  uid = activeLearnerId(),
): void {
  if (!uid || typeof window === "undefined") return;
  try {
    const value: CachedLevels = { savedAt: Date.now(), levels };
    window.localStorage.setItem(levelCacheKey(uid, skill, part), JSON.stringify(value));
    window.localStorage.removeItem(dirtyPartKey(uid, skill, part));
  } catch {
    // Storage is an optimization; the network response remains authoritative.
  }
}

export function isLearningLevelsDirty(
  skill: LearningSkill,
  part: number,
  uid = activeLearnerId(),
): boolean {
  if (!uid || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(dirtyPartKey(uid, skill, part)) === "1";
  } catch {
    return false;
  }
}

/**
 * Called only after a saved answer or reset. It removes just the changed part,
 * preserving cached progress for every other module and level.
 */
export function invalidateLearningLevels(
  skill: LearningSkill,
  parts: number[],
  uid = activeLearnerId(),
): void {
  const uniqueParts = [...new Set(parts)].filter((part) => Number.isInteger(part));
  if (uid && typeof window !== "undefined") {
    try {
      for (const part of uniqueParts) {
        window.localStorage.removeItem(levelCacheKey(uid, skill, part));
        window.localStorage.setItem(dirtyPartKey(uid, skill, part), "1");
      }
    } catch {
      // Continue to notify mounted dashboards even when storage is blocked.
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<LearningLevelsUpdatedDetail>(LEARNING_LEVELS_UPDATED_EVENT, {
      detail: { skill, parts: uniqueParts },
    }));
  }
}

export function clearActiveLearnerCache(): void {
  if (typeof window === "undefined") return;
  try {
    const uid = activeLearnerId();
    if (uid) {
      const prefix = `${LEVEL_CACHE_PREFIX}${uid}:`;
      const dirtyPrefix = `${DIRTY_PART_PREFIX}${uid}:`;
      for (let index = window.localStorage.length - 1; index >= 0; index--) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(prefix) || key?.startsWith(dirtyPrefix)) {
          window.localStorage.removeItem(key);
        }
      }
    }
    window.localStorage.removeItem(ACTIVE_LEARNER_KEY);
    window.dispatchEvent(new CustomEvent<ActiveLearnerUpdatedDetail>(ACTIVE_LEARNER_UPDATED_EVENT, {
      detail: { uid: null },
    }));
  } catch {
    // Logging out must still complete if storage is unavailable.
  }
}

function levelCacheKey(uid: string, skill: LearningSkill, part: number): string {
  return `${LEVEL_CACHE_PREFIX}${uid}:${skill}:${part}`;
}

function dirtyPartKey(uid: string, skill: LearningSkill, part: number): string {
  return `${DIRTY_PART_PREFIX}${uid}:${skill}:${part}`;
}
