import { afterEach, describe, expect, it, vi } from "vitest";
import { enforceEdgeRateLimit, rateLimitHeaders } from "./edge-rate-limit";

describe("enforceEdgeRateLimit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fails open only when Redis has not been configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    await expect(enforceEdgeRateLimit({
      key: "rate-limit:public:ip-a",
      limit: 10,
      windowMs: 60_000,
    })).resolves.toMatchObject({ enabled: false, allowed: true, remaining: 10 });
  });

  it("uses one atomic Redis script and exposes standard headers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T10:00:00.000Z"));
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { result: [0, 10, Date.now() + 8_000] },
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enforceEdgeRateLimit({
      key: "rate-limit:public:ip-a",
      limit: 10,
      windowMs: 60_000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.upstash.io/pipeline",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toMatchObject({ enabled: true, allowed: false, remaining: 0, retryAfterSeconds: 8 });
    expect(rateLimitHeaders(result)).toMatchObject({
      "RateLimit-Limit": "10",
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": "8",
    });
  });
});
