"use client";

import { useEffect, useState } from "react";
import { ACTIVE_LEARNER_UPDATED_EVENT, LEARNING_LEVELS_UPDATED_EVENT, activeLearnerId, isLearningLevelsDirty } from "@/lib/client-learning-progress-cache";
import type { DauToeicPartTest } from "@/types/dautoeic";
import { summarizeTests, type PartProgress } from "./listening-view-model";

const cache = new Map<string, { savedAt: number; progress: PartProgress }>();

export default function useListeningPartProgress(part: number, enabled: boolean) {
  const [view, setView] = useState<{ uid: string; parts: Partial<Record<number, PartProgress>> } | null>(null);

  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    const load = async () => {
      if (disposed || !enabled) return;
      controller?.abort();
      const uid = activeLearnerId();
      if (!uid) return;
      const request = new AbortController();
      controller = request;
      const parts: Partial<Record<number, PartProgress>> = {};
      for (const number of [1, 2, 3, 4]) {
        const saved = cache.get(`${uid}:${number}`);
        if (saved && Date.now() - saved.savedAt < 300_000 && !isLearningLevelsDirty("listening", number, uid)) parts[number] = saved.progress;
      }
      setView({ uid, parts: { ...parts } });
      for (const number of [1, 2, 3, 4]) {
        if (disposed || request.signal.aborted) return;
        if (number === part || parts[number]) continue;
        try {
          const response = await fetch(`/api/listening/tests?part=${number}`, { cache: "no-store", signal: request.signal });
          const payload = await response.json();
          if (disposed || request.signal.aborted || activeLearnerId() !== uid) return;
          if (!response.ok || !payload.success || payload.data?.uid !== uid || !Array.isArray(payload.data.tests)
            || !payload.data.tests.every((test: DauToeicPartTest) => test.part === number)) continue;
          const progress = summarizeTests(payload.data.tests);
          if (cache.size >= 16) cache.delete(cache.keys().next().value!);
          cache.set(`${uid}:${number}`, { savedAt: Date.now(), progress });
          parts[number] = progress;
          setView({ uid, parts: { ...parts } });
        } catch {
          if (request.signal.aborted) return;
        }
      }
    };
    const onIdentity = () => { cache.clear(); setView(null); void load(); };
    const onProgress = (event: Event) => {
      if ((event as CustomEvent<{ skill?: string }>).detail?.skill === "listening") void load();
    };
    void Promise.resolve().then(load);
    window.addEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onIdentity);
    window.addEventListener(LEARNING_LEVELS_UPDATED_EVENT, onProgress);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onIdentity);
      window.removeEventListener(LEARNING_LEVELS_UPDATED_EVENT, onProgress);
    };
  }, [enabled, part]);
  return enabled && view?.uid === activeLearnerId() ? view.parts : {};
}
