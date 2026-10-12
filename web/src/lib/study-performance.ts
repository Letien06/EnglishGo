type Name = "open" | "transition" | "sync";
type Outcome = "success" | "failure";
type Metric = { name: Name; skill: "reading" | "listening" | "vocab"; outcome: Outcome; count: number; totalMs: number; maxMs: number };
const metrics = new Map<string, Metric>();
let timer: ReturnType<typeof setTimeout> | undefined;
let navigationStart: number | undefined;

export function startStudyNavigation() { navigationStart = performance.now(); }
export function consumeStudyNavigationStart() {
  const start = navigationStart ?? (performance.getEntriesByType("navigation")[0]?.startTime ?? performance.now());
  navigationStart = undefined;
  return start;
}

export function flushStudyMetrics() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!metrics.size) return;
  const body = JSON.stringify({ metrics: [...metrics.values()] });
  metrics.clear();
  try {
    if (navigator.sendBeacon?.("/api/telemetry/study", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/telemetry/study", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* Measurement must never interrupt studying. */ }
}

/** Aggregate locally: no learner IDs, answers, text, or per-answer network calls. */
export function recordStudyMetric(name: Name, skill: Metric["skill"], outcome: Outcome, startedAt: number) {
  if (process.env.NODE_ENV !== "production" || typeof window === "undefined" || document.visibilityState === "hidden" && name !== "sync") return;
  const duration = Math.min(300_000, Math.max(0, Math.round(performance.now() - startedAt)));
  const key = `${name}:${skill}:${outcome}`;
  const metric = metrics.get(key) ?? { name, skill, outcome, count: 0, totalMs: 0, maxMs: 0 };
  metric.count++; metric.totalMs += duration; metric.maxMs = Math.max(metric.maxMs, duration);
  metrics.set(key, metric);
  if (!timer) timer = setTimeout(flushStudyMetrics, 15_000);
}
