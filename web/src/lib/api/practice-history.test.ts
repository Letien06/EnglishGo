import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => vi.fn());
vi.mock("../auth/session", () => ({ getReadIdentity: identity }));
import { practiceHistoryHandler } from "./practice-history";

beforeEach(() => identity.mockReset());
describe("private practice history", () => {
  it("uses verified identity, ignores query uid, and disables caching", async () => {
    identity.mockResolvedValue({ uid: "verified" });
    const load = vi.fn().mockResolvedValue({ q1: "A" });
    const response = await practiceHistoryHandler(1, 4, load)(new NextRequest("https://example.test/api/listening/progress?part=2&level=1&uid=attacker"), { params: Promise.resolve({}) });
    expect(load).toHaveBeenCalledWith("verified", 2, 1, null);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).data).toEqual({ uid: "verified", answers: { q1: "A" } });
  });
  it("returns no history for guests", async () => {
    identity.mockResolvedValue(null);
    const load = vi.fn();
    const response = await practiceHistoryHandler(5, 7, load)(new NextRequest("https://example.test/api/reading/progress?part=7&level=1"), { params: Promise.resolve({}) });
    expect(load).not.toHaveBeenCalled();
    expect((await response.json()).data).toEqual({ uid: null, answers: {} });
  });
  it("loads only the selected test without trusting a query level or uid", async () => {
    identity.mockResolvedValue({ uid: "verified" });
    const load = vi.fn().mockResolvedValue({ q1: "B" });
    const response = await practiceHistoryHandler(1, 4, load)(new NextRequest("https://example.test/api/listening/progress?part=3&testId=test-two&level=99&uid=other"), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(load).toHaveBeenCalledWith("verified", 3, 1, "test-two");
  });
  it.each(["part=5&level=1", "part=1&level=0", "part=1&level=1.5", "part=NaN&level=1", "part=2&level=99", "part=1&testId=", "part=1&testId=../test"])("rejects invalid coordinates: %s", async (query) => {
    const load = vi.fn();
    const response = await practiceHistoryHandler(1, 4, load)(new NextRequest(`https://example.test/api/listening/progress?${query}`), { params: Promise.resolve({}) });
    expect(response.status).toBe(400);
    expect(load).not.toHaveBeenCalled();
  });
});
