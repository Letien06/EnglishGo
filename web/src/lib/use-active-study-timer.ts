"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_IDLE_TIMEOUT_MS = 180_000;
const MAX_ITEM_SECONDS = 300;

export function createActiveStudyTracker(idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS) {
  let sessionSeconds = 0;
  let itemSeconds = 0;
  let lastInteractionAt = 0;

  return {
    markActivity(now: number) {
      lastInteractionAt = now;
    },
    tick(now: number, visible: boolean) {
      if (lastInteractionAt === 0) lastInteractionAt = now;
      if (!visible) return sessionSeconds;
      if (now - lastInteractionAt > idleTimeoutMs) return sessionSeconds;
      sessionSeconds += 1;
      if (itemSeconds < MAX_ITEM_SECONDS) itemSeconds += 1;
      return sessionSeconds;
    },
    resetItem() {
      itemSeconds = 0;
    },
    getSessionSeconds() {
      return sessionSeconds;
    },
    consumeItemSeconds() {
      const value = Math.max(1, itemSeconds);
      itemSeconds = 0;
      return value;
    },
  };
}

/**
 * Counts only active, visible study time (pauses when tab is hidden or learner
 * is idle for 3+ minutes) and tracks accurate per-question durations.
 */
export function useActiveStudyTimer(itemKey: string) {
  const [tracker] = useState(() => createActiveStudyTracker());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    tracker.resetItem();
  }, [itemKey, tracker]);

  useEffect(() => {
    tracker.markActivity(Date.now());
    const onActivity = () => tracker.markActivity(Date.now());
    const onVisibility = () => {
      if (document.visibilityState === "visible") tracker.markActivity(Date.now());
    };
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    const timer = window.setInterval(() => {
      const visible = document.visibilityState === "visible";
      const next = tracker.tick(Date.now(), visible);
      setElapsed(next);
    }, 1000);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tracker]);

  const consumeItemSeconds = useCallback(() => {
    return tracker.consumeItemSeconds();
  }, [tracker]);

  return { elapsed, consumeItemSeconds };
}
