"use client";

import { useEffect, useState } from "react";
import { useAuthenticatedSession } from "@/components/AuthenticatedSessionContext";
import { ACTIVE_LEARNER_UPDATED_EVENT, LEARNING_LEVELS_UPDATED_EVENT, activeLearnerId, isLearningLevelsDirty } from "@/lib/client-learning-progress-cache";
import type { DauToeicPartTest } from "@/types/dautoeic";
import ListeningDashboard from "../listen/_components/ListeningDashboard";
import { summarizeTests, studyParts, type ListeningMetadata, type PartProgress } from "../listen/_components/listening-view-model";

const progressCache = new Map<string, DauToeicPartTest[]>();

export default function TestDashboardClient({ skill, part, initialTests, initialError, listeningMetadata }: {
  skill: "listening" | "reading";
  part: number;
  initialTests: DauToeicPartTest[];
  initialError: boolean;
  listeningMetadata?: ListeningMetadata;
}) {
  const authenticated = useAuthenticatedSession();
  const [view, setView] = useState<{ uid: string | null; tests: DauToeicPartTest[]; resolved: boolean }>({ uid: null, tests: initialTests, resolved: false });
  const [progressError, setProgressError] = useState(false);

  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    const refresh = async () => {
      if (disposed) return;
      controller?.abort();
      const uid = authenticated ? activeLearnerId() : null;
      const key = `${skill}:${part}:${uid}`;
      if (isLearningLevelsDirty(skill, part, uid)) progressCache.delete(key);
      const cached = uid ? progressCache.get(key) : undefined;
      setView({ uid, tests: cached ?? initialTests, resolved: Boolean(cached) });
      setProgressError(false);
      if (!uid) return;
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch(`/api/${skill}/tests?part=${part}`, { cache: "no-store", signal: request.signal });
        const payload = await response.json();
        if (disposed || request.signal.aborted || activeLearnerId() !== uid) return;
        if (!response.ok || !payload.success || payload.data?.uid !== uid || !Array.isArray(payload.data.tests)) throw new Error("Progress unavailable");
        if (progressCache.size >= 32) progressCache.delete(progressCache.keys().next().value!);
        progressCache.set(key, payload.data.tests);
        setView({ uid, tests: payload.data.tests, resolved: true });
      } catch {
        if (!disposed && !request.signal.aborted && activeLearnerId() === uid) setProgressError(true);
      }
    };
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<{ skill?: string; parts?: number[] }>).detail;
      if (detail?.skill === skill && detail.parts?.includes(part)) {
        progressCache.delete(`${skill}:${part}:${activeLearnerId()}`);
        void refresh();
      }
    };
    const onIdentity = () => { progressCache.clear(); void refresh(); };
    void Promise.resolve().then(refresh);
    window.addEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onIdentity);
    window.addEventListener(LEARNING_LEVELS_UPDATED_EVENT, onProgress);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onIdentity);
      window.removeEventListener(LEARNING_LEVELS_UPDATED_EVENT, onProgress);
    };
  }, [authenticated, initialTests, part, skill]);

  const tests = authenticated && view.uid === activeLearnerId() ? view.tests : initialTests;
  const partProgress: Partial<Record<number, PartProgress>> = {};
  if (authenticated) {
    const uid = activeLearnerId();
    for (const { number } of studyParts(skill)) {
      const cached = progressCache.get(`${skill}:${number}:${uid}`);
      if (cached && !isLearningLevelsDirty(skill, number, uid)) partProgress[number] = summarizeTests(cached);
    }
  }
  return <ListeningDashboard skill={skill} tests={tests} part={part} initialError={initialError} progressError={progressError} progressReady={!authenticated || (view.resolved && view.uid === activeLearnerId())} authenticated={authenticated} partProgress={partProgress} metadata={listeningMetadata} />;
}
