"use client";

import { flushStudyMetrics, startStudyNavigation } from "@/lib/study-performance";
import { useEffect } from "react";

type Metric = { name: string; value: number; navigationType?: string; route?: string };

function sendMetric(metric: Metric) {
  const route = metric.route ?? window.location.pathname;
  const body = JSON.stringify({ ...metric, route });
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
  } else {
    void fetch("/api/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  }
}

export function markLearningReady(kind: "first-question" | "audio", value = performance.now()) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("englishgo:learning-ready", { detail: { kind, value } }));
  }
}

/**
 * Tracks custom study readiness milestones (`first-question`, `audio`) and
 * accurate cumulative CLS / worst INP / FID flushed once on page hide, rather
 * than firing 4–5 separate POST requests immediately on every route load
 * (Vercel SpeedInsights already captures standard Web Vitals).
 */
export default function PerformanceTelemetry() {
  useEffect(() => {
    const route = window.location.pathname;
    const sentReady = new Set<string>();
    let latestLcp: number | null = null;
    let cumulativeCls = 0;
    let fidDelay: number | null = null;
    let worstInp = 0;
    let vitalsFlushed = false;

    const flushVitals = () => {
      if (vitalsFlushed) return;
      vitalsFlushed = true;
      if (latestLcp !== null) sendMetric({ name: "LCP", value: Math.round(latestLcp), route });
      if (cumulativeCls > 0) sendMetric({ name: "CLS", value: Number(cumulativeCls.toFixed(4)), route });
      if (fidDelay !== null) sendMetric({ name: "FID", value: Math.round(fidDelay), route });
      if (worstInp > 0) sendMetric({ name: "INP", value: Math.round(worstInp), route });
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && (!anchor.target || anchor.target === "_self") && anchor.origin === location.origin && /\/(practice|flashcards)(?:$|\/)/.test(anchor.pathname)) {
        startStudyNavigation();
      }
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        flushStudyMetrics();
        flushVitals();
      }
    };
    const onPageHide = () => {
      flushStudyMetrics();
      flushVitals();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);

    const observers: PerformanceObserver[] = [];
    const observe = (
      type: string,
      handler: (entry: PerformanceEntry) => void,
      options?: PerformanceObserverInit & { durationThreshold?: number },
    ) => {
      try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(handler));
        observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit);
        observers.push(observer);
      } catch {
        /* Unsupported metric. */
      }
    };
    observe("largest-contentful-paint", (entry) => {
      latestLcp = entry.startTime;
    });
    observe("layout-shift", (entry) => {
      const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
      if (!shift.hadRecentInput && typeof shift.value === "number") {
        cumulativeCls += shift.value;
      }
    });
    observe("first-input", (entry) => {
      const firstInput = entry as PerformanceEntry & { processingStart?: number };
      if (fidDelay === null && typeof firstInput.processingStart === "number") {
        fidDelay = Math.max(0, firstInput.processingStart - firstInput.startTime);
      }
    });
    observe(
      "event",
      (entry) => {
        if (entry.duration > worstInp) worstInp = entry.duration;
      },
      { durationThreshold: 40 },
    );

    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: "first-question" | "audio"; value: number }>).detail;
      const key = `${window.location.pathname}:${detail.kind}`;
      if (sentReady.has(key)) return;
      sentReady.add(key);
      sendMetric({ name: detail.kind, value: Math.round(detail.value) });
    };
    window.addEventListener("englishgo:learning-ready", onReady);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      observers.forEach((observer) => observer.disconnect());
      window.removeEventListener("englishgo:learning-ready", onReady);
    };
  }, []);
  return null;
}
