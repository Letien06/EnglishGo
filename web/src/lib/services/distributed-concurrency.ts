import { ApiError, TooManyRequests } from "@/lib/api/response";
import { executeRedisScript, getUpstashConfig } from "@/lib/upstash-rest";

interface ConcurrencyOptions {
  maxConcurrent: number;
  leaseMs?: number;
}

const DEFAULT_LEASE_MS = 45_000;

// The ZSET holds active lease IDs as members and their expiry time as scores.
// Expired leases are reaped during every acquire so an interrupted function
// cannot consume capacity forever.
const ACQUIRE_LEASE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local lease = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local token = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
local active = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local nextExpiry = now + lease
if oldest[2] then nextExpiry = tonumber(oldest[2]) end
if active >= maximum then
  redis.call('PEXPIRE', key, lease)
  return {0, active, nextExpiry}
end
local expiresAt = now + lease
redis.call('ZADD', key, expiresAt, token)
redis.call('PEXPIRE', key, lease)
return {1, active + 1, expiresAt}
`;

const RELEASE_LEASE_SCRIPT = `
redis.call('ZREM', KEYS[1], ARGV[1])
return 1
`;

/**
 * Global Redis semaphore for a dependency shared by all serverless instances.
 * It is intentionally a rejector, not a queue: holding function invocations
 * open while waiting would amplify an overload.
 */
export async function withDistributedConcurrency<T>(
  resource: string,
  options: ConcurrencyOptions,
  task: () => Promise<T>,
): Promise<T> {
  if (!getUpstashConfig()) {
    if (shouldFailClosed()) {
      throw new ApiError("Service capacity guard is unavailable", 503, {
        "Retry-After": "1",
      });
    }
    return task();
  }

  const maxConcurrent = positiveInteger(options.maxConcurrent, "maxConcurrent");
  const leaseMs = positiveInteger(options.leaseMs ?? DEFAULT_LEASE_MS, "leaseMs");
  const token = leaseToken();
  const now = Date.now();
  let acquired = false;

  try {
    const rawResult = await executeRedisScript(
      ACQUIRE_LEASE_SCRIPT,
      [`concurrency:${safeResource(resource)}`],
      [now, leaseMs, maxConcurrent, token],
    );
    const [allowedValue, activeValue, nextExpiryValue] = Array.isArray(rawResult)
      ? rawResult
      : [];
    const allowed = Number(allowedValue) === 1;
    const active = Number(activeValue);
    const nextExpiry = Number(nextExpiryValue);
    if (!Number.isFinite(active) || !Number.isFinite(nextExpiry)) {
      throw new Error("Upstash Redis returned an invalid concurrency result");
    }
    if (!allowed) {
      throw TooManyRequests(
        "Service is busy. Please retry shortly.",
        Math.max(1, Math.ceil((nextExpiry - now) / 1_000)),
        maxConcurrent,
      );
    }
    acquired = true;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (shouldFailClosed()) {
      throw new ApiError("Service capacity guard is unavailable", 503, {
        "Retry-After": "1",
      });
    }
    // Redis guard failure should be visible in logs but must not turn a Redis
    // networking blip into an application-wide outage unless fail-closed is
    // explicitly enabled for the deployment.
    console.error("distributed-concurrency-unavailable", { resource });
    return task();
  }

  try {
    return await task();
  } finally {
    if (acquired) {
      await executeRedisScript(
        RELEASE_LEASE_SCRIPT,
        [`concurrency:${safeResource(resource)}`],
        [token],
      ).catch(() => {
        // The lease expires automatically; never mask the successful task.
        console.error("distributed-concurrency-release-failed", { resource });
      });
    }
  }
}

export function withFirebaseRequestConcurrency<T>(
  task: () => Promise<T>,
): Promise<T> {
  return withDistributedConcurrency("firebase-api", {
    maxConcurrent: envPositiveInteger("FIREBASE_MAX_CONCURRENCY", 160),
  }, task);
}

export function withGeminiConcurrency<T>(task: () => Promise<T>): Promise<T> {
  return withDistributedConcurrency("gemini", {
    maxConcurrent: envPositiveInteger("GEMINI_MAX_CONCURRENCY", 12),
  }, task);
}

function shouldFailClosed(): boolean {
  return process.env.CONCURRENCY_LIMIT_FAIL_CLOSED?.trim().toLowerCase() === "true";
}

function envPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function safeResource(resource: string): string {
  const value = resource.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 64);
  if (!value) throw new Error("Concurrency resource is required");
  return value;
}

function leaseToken(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
