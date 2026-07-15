#!/usr/bin/env node

/**
 * Controlled HTTP burst test for a local EnglishGO build.
 *
 * Examples:
 *   node scripts/load-test.mjs --path /api/health --concurrency 100 --requests 1000
 *   node scripts/load-test.mjs --path / --concurrency 100 --requests 500
 *
 * It deliberately rejects non-loopback targets so it cannot accidentally be
 * used as a production traffic flood. Use a distributed load-testing service
 * with an approved maintenance window for a production capacity exercise.
 */

import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const MAX_LOCAL_CONCURRENCY = 2_000;
const MAX_LOCAL_REQUESTS = 20_000;

function readOption(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function toPositiveInt(value, name, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

function percentile(samples, p) {
  if (!samples.length) return 0;
  const index = Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1);
  return samples[index];
}

function isLoopback(url) {
  return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
}

const baseUrl = new URL(readOption("base-url", DEFAULT_BASE_URL));
const path = readOption("path", "/api/health");
const concurrency = toPositiveInt(readOption("concurrency", "100"), "concurrency", MAX_LOCAL_CONCURRENCY);
const requests = toPositiveInt(readOption("requests", String(concurrency * 10)), "requests", MAX_LOCAL_REQUESTS);
const timeoutMs = toPositiveInt(readOption("timeout-ms", "5000"), "timeout-ms", 60_000);

if (!isLoopback(baseUrl)) {
  throw new Error("This harness only accepts a loopback --base-url. Do not use it against a deployed site.");
}

const target = new URL(path, baseUrl);
const durations = [];
const statusCounts = new Map();
const errors = new Map();
let nextRequest = 0;
let completed = 0;
let timedOut = 0;
let maxEventLoopDelayMs = 0;
let previousTick = performance.now();
const interval = setInterval(() => {
  const now = performance.now();
  maxEventLoopDelayMs = Math.max(maxEventLoopDelayMs, now - previousTick - 100);
  previousTick = now;
}, 100);

async function oneRequest() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(target, {
      method: "GET",
      cache: "no-store",
      headers: { "x-load-test": "englishgo-local" },
      signal: controller.signal,
    });
    statusCounts.set(response.status, (statusCounts.get(response.status) ?? 0) + 1);
    await response.arrayBuffer();
  } catch (error) {
    const label = error?.name === "AbortError" ? "timeout" : (error?.name || "network_error");
    errors.set(label, (errors.get(label) ?? 0) + 1);
    if (label === "timeout") timedOut += 1;
  } finally {
    clearTimeout(timer);
    durations.push(performance.now() - startedAt);
    completed += 1;
  }
}

async function worker() {
  while (nextRequest < requests) {
    nextRequest += 1;
    await oneRequest();
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
clearInterval(interval);
const totalMs = performance.now() - startedAt;
durations.sort((left, right) => left - right);

const result = {
  target: target.toString(),
  concurrency,
  requests,
  completed,
  duration_ms: Math.round(totalMs),
  throughput_rps: Number((completed / (totalMs / 1000)).toFixed(1)),
  latency_ms: {
    min: Number((durations[0] ?? 0).toFixed(1)),
    p50: Number(percentile(durations, 0.5).toFixed(1)),
    p95: Number(percentile(durations, 0.95).toFixed(1)),
    p99: Number(percentile(durations, 0.99).toFixed(1)),
    max: Number((durations.at(-1) ?? 0).toFixed(1)),
  },
  timed_out: timedOut,
  statuses: Object.fromEntries([...statusCounts.entries()].sort(([a], [b]) => a - b)),
  errors: Object.fromEntries(errors),
  max_event_loop_delay_ms: Number(maxEventLoopDelayMs.toFixed(1)),
};

console.log(JSON.stringify(result, null, 2));

if (timedOut > 0 || [...statusCounts.entries()].some(([status]) => status >= 500)) {
  process.exitCode = 2;
}
