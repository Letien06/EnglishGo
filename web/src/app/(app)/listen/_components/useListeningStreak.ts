"use client";

import { useEffect, useState } from "react";
import { ACTIVE_LEARNER_UPDATED_EVENT, activeLearnerId } from "@/lib/client-learning-progress-cache";
import { publishStudyStreak, readStudyStreakCache, STUDY_STREAK_UPDATED_EVENT, type StudyStreakSnapshot } from "@/lib/client-study-streak-cache";

type Streak = Pick<StudyStreakSnapshot, "streakDays" | "studiedToday" | "authenticated">;

export default function useListeningStreak(authenticated: boolean) {
  const [result, setResult] = useState<{ uid: string; data: Streak } | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    const load = async () => {
      if (disposed) return;
      controller?.abort();
      const uid = authenticated ? activeLearnerId() : null;
      if (!uid) return;
      const cached = readStudyStreakCache(uid);
      if (cached) {
        setResult({ uid, data: cached.data });
        return;
      }
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/study/streak", { cache: "no-store", signal: request.signal });
        const payload = await response.json();
        if (response.ok && payload.success && payload.data?.authenticated && Number.isFinite(payload.data.streakDays)
          && !request.signal.aborted && activeLearnerId() === uid) {
          publishStudyStreak(uid, payload.data, true);
          setResult({ uid, data: payload.data });
        }
      } catch {
        return;
      }
    };
    void Promise.resolve().then(load);
    window.addEventListener(ACTIVE_LEARNER_UPDATED_EVENT, load);
    const onStreak = (event: Event) => {
      if ((event as CustomEvent<{ uid?: string }>).detail?.uid === activeLearnerId()) void load();
    };
    window.addEventListener(STUDY_STREAK_UPDATED_EVENT, onStreak);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(ACTIVE_LEARNER_UPDATED_EVENT, load);
      window.removeEventListener(STUDY_STREAK_UPDATED_EVENT, onStreak);
    };
  }, [authenticated]);
  return authenticated && result?.uid === activeLearnerId() ? result.data : null;
}
