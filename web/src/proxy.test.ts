import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EdgeRateLimitPolicy } from "@/lib/edge-rate-limit";

const mock = vi.hoisted(() => ({ enforce: vi.fn() }));
vi.mock("@/lib/edge-rate-limit", () => ({ enforceEdgeRateLimit: mock.enforce, rateLimitHeaders: () => ({}) }));
import { proxy } from "./proxy";

function request(path: string, authenticated = true, method = "POST") {
  return new NextRequest(`http://localhost${path}`, { method, headers: { "x-vercel-forwarded-for": "192.0.2.1", ...(authenticated ? { cookie: "session=test" } : {}) } });
}
beforeEach(() => {
  mock.enforce.mockReset();
  mock.enforce.mockResolvedValue({ enabled: true, allowed: true });
  vi.stubEnv("RATE_LIMIT_VOCAB_RACE_PER_MIN", "");
  vi.stubEnv("RATE_LIMIT_WRITE_PER_MIN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("race API capacity policy", () => {
  it("accepts five players sending one batch per second on a shared IP", async () => {
    const counts = new Map<string, number>();
    mock.enforce.mockImplementation(async (policy: EdgeRateLimitPolicy) => {
      const count = (counts.get(policy.key) ?? 0) + 1;
      counts.set(policy.key, count);
      return { enabled: true, allowed: count <= policy.limit, retryAfterSeconds: 60 };
    });
    for (let second = 0; second < 60; second++) {
      for (let player = 0; player < 5; player++) expect((await proxy(request("/api/vocab/game-room/answer"))).status).toBe(200);
    }
    expect(mock.enforce).toHaveBeenLastCalledWith(expect.objectContaining({ key: expect.stringContaining("rate-limit:vocab-race:"), limit: 360, windowMs: 60000 }));
    expect(counts.size).toBe(1);
  });
  it("keeps generic writes at 120 and in a separate IP bucket", async () => {
    await proxy(request("/api/vocab/game-room/answer"));
    await proxy(request("/api/vocab/game-room/start"));
    await proxy(request("/api/account/update"));
    const policies = mock.enforce.mock.calls.map(call => call[0] as EdgeRateLimitPolicy);
    expect(policies[1]).toMatchObject({ key: expect.stringContaining("rate-limit:write:"), limit: 120 });
    expect(policies[2]).toEqual(policies[1]);
    expect(policies[0].key).not.toBe(policies[1].key);
  });
  it("limits anonymous race writes to 30 without sharing the authenticated bucket", async () => {
    await proxy(request("/api/vocab/game-room/answer", false));
    expect(mock.enforce).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringContaining("rate-limit:public-vocab-race:"), limit: 30 }));
  });
  it("honors the race override while generic writes keep their own override", async () => {
    vi.stubEnv("RATE_LIMIT_VOCAB_RACE_PER_MIN", "420");
    vi.stubEnv("RATE_LIMIT_WRITE_PER_MIN", "100");
    await proxy(request("/api/vocab/game-room/answer"));
    await proxy(request("/api/account/update"));
    expect(mock.enforce.mock.calls.map(call => call[0].limit)).toEqual([420, 100]);
  });
  it("does not apply the race write allowance to GET requests", async () => {
    await proxy(request("/api/vocab/game-room/answer", true, "GET"));
    expect(mock.enforce).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringContaining("rate-limit:authenticated-read:") }));
  });
});
