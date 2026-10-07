import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Unauthorized } from "@/lib/api/response";
import { GET } from "./stats/route";
import { POST } from "./preferences/route";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), stats: vi.fn(), preferences: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser, invalidateCurrentUserProfileCache: vi.fn() }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: {} }));
vi.mock("@/lib/services/distributed-concurrency", () => ({ withFirebaseRequestConcurrency: (reader: () => Promise<unknown>) => reader() }));
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/services/dashboard", async (original) => {
  const service = await original<typeof import("@/lib/services/dashboard")>();
  return { ...service, getDashboardStats: mocks.stats, updateDashboardPreferences: mocks.preferences };
});
const context = { params: Promise.resolve({}) };
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/dashboard/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), context);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ uid: "signed-in-user" });
  mocks.stats.mockResolvedValue({ metrics: { reading: 3 }, start: "2026-01-01", end: "2026-01-05" });
  mocks.preferences.mockResolvedValue({ targetScore: 800 });
});

describe("authenticated dashboard routes", () => {
  it("denies both APIs without authentication before reading or updating learner data", async () => {
    mocks.requireUser.mockRejectedValue(Unauthorized("Authentication required"));
    expect((await GET(new NextRequest("http://localhost/api/dashboard/stats"), context)).status).toBe(401);
    expect((await post({ targetScore: 800 })).status).toBe(401);
    expect(mocks.stats).not.toHaveBeenCalled();
    expect(mocks.preferences).not.toHaveBeenCalled();
  });
  it("always reads the authenticated UID and rejects unsupported periods", async () => {
    const response = await GET(new NextRequest("http://localhost/api/dashboard/stats?period=custom&start=2026-01-01&end=2026-01-05&uid=other-user"), context);
    expect(response.status).toBe(200);
    expect(mocks.stats).toHaveBeenCalledWith("signed-in-user", "custom", "2026-01-01", "2026-01-05");
    expect((await GET(new NextRequest("http://localhost/api/dashboard/stats?period=decade"), context)).status).toBe(400);
    expect(mocks.stats).toHaveBeenCalledOnce();
  });
  it("accepts partial preferences at score bounds and uses only the authenticated UID", async () => {
    expect((await post({ currentScore: 0, targetScore: 990, examDate: null })).status).toBe(200);
    expect(mocks.preferences).toHaveBeenCalledWith("signed-in-user", { currentScore: 0, targetScore: 990, examDate: null });
  });
  it("rejects malformed dates, score steps, out-of-range goals and caller-supplied UID", async () => {
    for (const body of [{ targetScore: 751 }, { currentScore: -5 }, { examDate: "2026-02-30" }, { uid: "other-user", targetScore: 800 }, { dailyGoals: { reading: { enabled: true, target: 201 } } }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(mocks.preferences).not.toHaveBeenCalled();
  });
  it("returns a failure envelope for unavailable stats instead of zero metrics", async () => {
    mocks.stats.mockRejectedValue(new Error("read unavailable"));
    const response = await GET(new NextRequest("http://localhost/api/dashboard/stats"), context);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, data: null });
  });
});
