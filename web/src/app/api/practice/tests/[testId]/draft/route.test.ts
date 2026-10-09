import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user, requireUserForRead: mocks.user }));
vi.mock("@/lib/services/practice", () => ({ saveDraft: mocks.save, getDraft: vi.fn(), deleteDraft: vi.fn() }));
vi.mock("@/lib/services/distributed-concurrency", () => ({ withFirebaseRequestConcurrency: (run: () => unknown) => run() }));
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));
import { PUT } from "./route";
const body = { payload: "{}", expectedUid: "alice", requestId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", revision: 100, runStartedAtMillis: 10 };
const put = (data: unknown) => PUT(new NextRequest("https://test.local/api/practice/tests/1/draft", { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ testId: "1" }) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ uid: "alice" }); mocks.save.mockResolvedValue({}); });
describe("queued exam API ownership", () => {
  it("checks expected owner before invoking persistence", async () => {
    mocks.user.mockResolvedValue({ uid: "bob" });
    expect((await put(body)).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("passes the stable request ID, run fence and revision to the writer", async () => {
    expect((await put(body)).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("alice", 1, "{}", expect.any(Object), undefined, { requestId: body.requestId, revision: 100, runStartedAtMillis: 10 });
  });
  it.each([{ ...body, expectedUid: undefined }, { ...body, revision: undefined }, { ...body, requestId: "invalid" }])("rejects incomplete metadata", async invalid => {
    expect((await put(invalid)).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
