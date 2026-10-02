"use client";

import { useEffect, useState } from "react";
import { ACTIVE_LEARNER_UPDATED_EVENT, activeLearnerId } from "@/lib/client-learning-progress-cache";

type Streak = { streakDays: number; studiedToday: boolean; authenticated: boolean };

export default function useListeningStreak(authenticated: boolean) {
  const [result, setResult] = useState<{ uid: string; data: Streak } | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    const load = async () => {
      if (disposed) return;
      controller?.abort();
      setResult(null);
      const uid = authenticated ? activeLearnerId() : null;
      if (!uid) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/study/streak", { cache: "no-store", signal: request.signal });
        const payload = await response.json();
        if (response.ok && payload.success && payload.data?.authenticated && Number.isFinite(payload.data.streakDays)
          && !request.signal.aborted && activeLearnerId() === uid) setResult({ uid, data: payload.data });
      } catch {
        return;
      }
    };
    void Promise.resolve().then(load);
    window.addEventListener(ACTIVE_LEARNER_UPDATED_EVENT, load);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(ACTIVE_LEARNER_UPDATED_EVENT, load);
    };
  }, [authenticated]);
  return authenticated && result?.uid === activeLearnerId() ? result.data : null;
}
