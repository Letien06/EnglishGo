import { track } from "@vercel/analytics";

export const CLIENT_PERFORMANCE_BUDGETS = {
  vocab_group_select: 100,
  dautoeic_part_sync: 3_000,
  vocab_review_batch: 3_000,
  vocab_save_complete: 4_000,
} as const;

export type ClientPerformanceFlow = keyof typeof CLIENT_PERFORMANCE_BUDGETS;
type ClientPerformanceOutcome = "success" | "http_error" | "network_error" | "timeout";

type RequestTelemetry = {
  flow?: ClientPerformanceFlow;
};

export class ClientRequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
    this.name = "ClientRequestTimeoutError";
  }
}

/**
 * Emits a compact, non-identifying timing event once Vercel Analytics is ready.
 * Budgets are intentionally lower than the hard timeout so slow paths show up
 * in production data before a user ever sees a failure state.
 */
export function recordClientTiming(
  flow: ClientPerformanceFlow,
  outcome: ClientPerformanceOutcome,
  startedAt: number,
  statusCode?: number,
) {
  if (typeof window === "undefined" || !window.va) return;

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  track("client_interaction", {
    flow,
    outcome,
    duration_ms: durationMs,
    status_code: statusCode ?? null,
  });

  if (durationMs > CLIENT_PERFORMANCE_BUDGETS[flow]) {
    track("client_latency_budget_exceeded", {
      flow,
      duration_ms: durationMs,
      budget_ms: CLIENT_PERFORMANCE_BUDGETS[flow],
    });
  }
}

/** Measures the next paint, so local interactions have a real UI budget too. */
export function recordNextPaint(flow: ClientPerformanceFlow, startedAt = performance.now()) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => recordClientTiming(flow, "success", startedAt));
}

/**
 * Gives user-initiated requests a bounded lifecycle. We intentionally do not
 * retry mutations here: once a browser aborts, the server may still complete
 * the write, so automatic retries could duplicate side effects.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10_000,
  telemetry: RequestTelemetry = {},
): Promise<Response> {
  const controller = new AbortController();
  const inheritedSignal = init.signal;
  const startedAt = typeof performance === "undefined" ? 0 : performance.now();

  function abortFromCaller() {
    controller.abort(inheritedSignal?.reason);
  }

  if (inheritedSignal?.aborted) abortFromCaller();
  else inheritedSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (telemetry.flow) {
      recordClientTiming(
        telemetry.flow,
        response.ok ? "success" : "http_error",
        startedAt,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (controller.signal.aborted && !inheritedSignal?.aborted) {
      if (telemetry.flow) recordClientTiming(telemetry.flow, "timeout", startedAt);
      throw new ClientRequestTimeoutError(timeoutMs);
    }
    if (telemetry.flow) recordClientTiming(telemetry.flow, "network_error", startedAt);
    throw error;
  } finally {
    window.clearTimeout(timeout);
    inheritedSignal?.removeEventListener("abort", abortFromCaller);
  }
}
