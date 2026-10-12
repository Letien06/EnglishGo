"use client";
import { useCallback, useEffect, useRef } from "react";
import { consumeStudyNavigationStart, recordStudyMetric, startStudyNavigation } from "./study-performance";

export function useStudyPerformance(skill: "reading" | "listening", itemId: string) {
  const first = useRef(true);
  const transition = useRef<number | null>(null);
  useEffect(() => {
    const name = first.current ? "open" : "transition";
    const start = first.current ? consumeStudyNavigationStart() : transition.current;
    let second = 0;
    const frame = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
      if (start !== null) recordStudyMetric(name, skill, "success", start);
      first.current = false; transition.current = null;
    }); });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(second); };
  }, [itemId, skill]);
  return useCallback((reload: boolean) => {
    transition.current = performance.now();
    if (reload) startStudyNavigation();
  }, []);
}
