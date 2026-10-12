import { z } from "zod";
import { withErrorHandling } from "@/lib/api/handler";
import { parseBody } from "@/lib/api/validate";
import { ok } from "@/lib/api/response";
import { logInfo } from "@/lib/logging";
import { requireRole } from "@/lib/auth/session";

const schema = z.object({ metrics: z.array(z.object({
  name: z.enum(["open", "transition", "sync"]), skill: z.enum(["reading", "listening", "vocab"]),
  outcome: z.enum(["success", "failure"]), count: z.number().int().min(1).max(10000),
  totalMs: z.number().finite().min(0).max(3_000_000_000), maxMs: z.number().finite().min(0).max(300_000),
  samples: z.array(z.number().finite().min(0).max(300_000)).max(100).default([]),
})).min(1).max(18) });

type WindowMetric = { startedAt: number; count: number; failures: number; totalMs: number; maxMs: number; samples: number[] };
const windowMetrics = new Map<string, WindowMetric>();
const WINDOW_MS = 15 * 60 * 1000;
const percentile = (values: number[], rank: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(rank * sorted.length) - 1)];
};

function report() {
  return [...windowMetrics.entries()].map(([key, value]) => {
    const [name, skill] = key.split(":");
    const p50Ms = percentile(value.samples, 0.5);
    const p95Ms = percentile(value.samples, 0.95);
    const failureRate = value.count ? value.failures / value.count : 0;
    const slowThreshold = name === "open" ? 5000 : name === "transition" ? 1500 : 3000;
    return { name, skill, count: value.count, avgMs: Math.round(value.totalMs / value.count), p50Ms, p95Ms, failureRate: Number(failureRate.toFixed(4)), maxMs: value.maxMs, alert: p95Ms > slowThreshold || failureRate > 0.05 };
  });
}

export const GET = withErrorHandling(async () => {
  await requireRole("ADMIN");
  return ok({ metrics: report() });
});

export const POST = withErrorHandling(async (request) => {
  const { metrics } = await parseBody(request, schema);
  for (const metric of metrics) {
    const key = `${metric.name}:${metric.skill}`;
    const now = Date.now();
    const previous = windowMetrics.get(key);
    const aggregate = !previous || now - previous.startedAt >= WINDOW_MS
      ? { startedAt: now, count: 0, failures: 0, totalMs: 0, maxMs: 0, samples: [] }
      : previous;
    aggregate.count += metric.count;
    aggregate.failures += metric.outcome === "failure" ? metric.count : 0;
    aggregate.totalMs += metric.totalMs;
    aggregate.maxMs = Math.max(aggregate.maxMs, metric.maxMs);
    aggregate.samples.push(...metric.samples);
    if (aggregate.samples.length > 500) aggregate.samples.splice(0, aggregate.samples.length - 500);
    windowMetrics.set(key, aggregate);
    const p50Ms = percentile(aggregate.samples, 0.5);
    const p95Ms = percentile(aggregate.samples, 0.95);
    const failureRate = aggregate.count ? aggregate.failures / aggregate.count : 0;
    const summary = { name: metric.name, skill: metric.skill, count: aggregate.count, avgMs: Math.round(aggregate.totalMs / aggregate.count), p50Ms, p95Ms, failureRate: Number(failureRate.toFixed(4)), maxMs: aggregate.maxMs };
    logInfo("study-performance", summary);
    const slowThreshold = metric.name === "open" ? 5000 : metric.name === "transition" ? 1500 : 3000;
    if (p95Ms > slowThreshold || failureRate > 0.05) logInfo("study-performance-alert", { ...summary, slowThreshold });
  }
  return ok({ accepted: true });
});
