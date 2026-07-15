import { executeRedisScript, getUpstashConfig } from "@/lib/upstash-rest";

export interface EdgeRateLimitPolicy {
  key: string;
  limit: number;
  windowMs: number;
}

export interface EdgeRateLimitResult {
  enabled: boolean;
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMillis: number;
  retryAfterSeconds: number;
}

// A ZSET sliding window. Each request adds one unique member; expired entries
// are removed in the same Redis operation before the request is accepted.
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local maximum = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local reset = now + window
if oldest[2] then reset = tonumber(oldest[2]) + window end
if count >= maximum then
  redis.call('PEXPIRE', key, window)
  return {0, count, reset}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, reset}
`;

export async function enforceEdgeRateLimit(
  policy: EdgeRateLimitPolicy,
): Promise<EdgeRateLimitResult> {
  const now = Date.now();
  const normalizedLimit = positiveInteger(policy.limit, "limit");
  const normalizedWindowMs = positiveInteger(policy.windowMs, "windowMs");
  if (!getUpstashConfig()) {
    return {
      enabled: false,
      allowed: true,
      limit: normalizedLimit,
      remaining: normalizedLimit,
      resetAtMillis: now + normalizedWindowMs,
      retryAfterSeconds: 0,
    };
  }

  const result = await executeRedisScript(
    SLIDING_WINDOW_SCRIPT,
    [policy.key],
    [now, normalizedWindowMs, normalizedLimit, requestMember()],
  );
  const [allowedValue, countValue, resetValue] = Array.isArray(result) ? result : [];
  const allowed = Number(allowedValue) === 1;
  const count = Number(countValue);
  const resetAtMillis = Number(resetValue);
  if (!Number.isFinite(count) || !Number.isFinite(resetAtMillis)) {
    throw new Error("Upstash Redis returned an invalid rate limit result");
  }

  return {
    enabled: true,
    allowed,
    limit: normalizedLimit,
    remaining: Math.max(0, normalizedLimit - count),
    resetAtMillis,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((resetAtMillis - now) / 1_000)),
  };
}

export function rateLimitHeaders(result: EdgeRateLimitResult): Record<string, string> {
  if (!result.enabled) return {};
  const resetSeconds = Math.max(0, Math.ceil((result.resetAtMillis - Date.now()) / 1_000));
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(resetSeconds),
  };
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Rate limit ${field} must be a positive integer`);
  }
  return value;
}

function requestMember(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
