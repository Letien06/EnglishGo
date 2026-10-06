import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/services/distributed-concurrency", () => ({ withFirebaseRequestConcurrency: (execute: () => unknown) => execute() }));
import { withErrorHandling } from "./handler";
describe("Firestore quota response", () => {
  it.each([8, 429, "resource-exhausted"])("returns a temporary outage and cooldown for %s", async (code) => {
    const handler = withErrorHandling(async () => { throw Object.assign(new Error("Quota exceeded."), { code }); });
    const response = await handler(new NextRequest("https://example.com/api/vocab/game-room"), { params: Promise.resolve({}) });
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect((await response.json()).success).toBe(false);
  });
});
