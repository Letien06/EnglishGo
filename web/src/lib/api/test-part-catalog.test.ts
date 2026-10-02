import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), catalog: vi.fn() }));
vi.mock("../auth/session", () => ({ getReadIdentity: mocks.identity }));
vi.mock("../services/test-part-practice", () => ({ listTestParts: mocks.catalog }));
import { testPartCatalogHandler } from "./test-part-catalog";

beforeEach(() => vi.clearAllMocks());
describe("private test catalog endpoint", () => {
  it("uses the verified user and never returns internal question membership", async () => {
    mocks.identity.mockResolvedValue({ uid: "verified" });
    const summary = { testId: "test-one", part: 1, questionCount: 6, done: 2 };
    const internal = [{ test: summary, items: [{ id: "item", questionIds: ["q1"] }] }];
    mocks.catalog.mockResolvedValue(internal);
    const progress = vi.fn().mockResolvedValue([summary]);
    const response = await testPartCatalogHandler(1, 4, progress)(new NextRequest("https://example.test/api/listening/tests?part=1&uid=attacker"), { params: Promise.resolve({}) });
    expect(progress).toHaveBeenCalledWith("verified", internal);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).data).toEqual({ uid: "verified", tests: [summary] });
  });
  it.each(["0", "5", "1.5", "NaN"])("rejects an invalid listening Part %s", async (part) => {
    const response = await testPartCatalogHandler(1, 4, vi.fn())(new NextRequest(`https://example.test/api/listening/tests?part=${part}`), { params: Promise.resolve({}) });
    expect(response.status).toBe(400);
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.identity).not.toHaveBeenCalled();
  });
});
