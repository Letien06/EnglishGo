"use client";

import { flushStudyMetrics, startStudyNavigation } from "@/lib/study-performance";
import { useEffect } from "react";

type Metric = { name: string; value: number; navigationType?: string; route?: string };
const sent = new Set<string>();

function send(metric: Metric) {
  const route = metric.route ?? window.location.pathname;
  const key = `${route}:${metric.name}`;
  if (sent.has(key)) return;
  sent.add(key);
  const body = JSON.stringify({ ...metric, route });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
  else void fetch("/api/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
}

export function markLearningReady(kind: "first-question" | "audio", value = performance.now()) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("englishgo:learning-ready", { detail: { kind, value } }));
}

export default function PerformanceTelemetry() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (anchor && (!anchor.target || anchor.target === "_self") && anchor.origin === location.origin && /\/(practice|flashcards)(?:$|\/)/.test(anchor.pathname)) startStudyNavigation();
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flushStudyMetrics(); };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushStudyMetrics);
    const observers: PerformanceObserver[] = [];
    const observe = (type: string, handler: (entry: PerformanceEntry) => void, options?: PerformanceObserverInit & { durationThreshold?: number }) => {
      try { const observer = new PerformanceObserver(list => list.getEntries().forEach(handler)); observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit); observers.push(observer); } catch { /* Unsupported metric. */ }
    };
    observe("largest-contentful-paint", entry => send({ name: "LCP", value: entry.startTime }));
    observe("layout-shift", entry => { if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) send({ name: "CLS", value: (entry as PerformanceEntry & { value?: number }).value ?? 0 }); });
    observe("first-input", entry => send({ name: "FID", value: entry.startTime }));
    observe("event", entry => send({ name: "INP", value: entry.duration }), { durationThreshold: 40 });
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation) send({ name: "TTFB", value: navigation.responseStart - navigation.requestStart, navigationType: navigation.type });
    const onReady = (event: Event) => { const detail = (event as CustomEvent<{ kind: "first-question" | "audio"; value: number }>).detail; send({ name: detail.kind, value: detail.value }); };
    window.addEventListener("englishgo:learning-ready", onReady);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("visibilitychange", onHidden); window.removeEventListener("pagehide", flushStudyMetrics); observers.forEach(observer => observer.disconnect()); window.removeEventListener("englishgo:learning-ready", onReady); };
  }, []);
  return null;
}
