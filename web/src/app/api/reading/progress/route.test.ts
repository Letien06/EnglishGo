import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.identity, getReadIdentity: vi.fn() }));
vi.mock("@/lib/services/reading", () => ({ recordProgress: mocks.save, loadAnswers: vi.fn() }));
vi.mock("@/lib/services/distributed-concurrency", () => ({ withFirebaseRequestConcurrency: (execute: () => unknown) => execute() }));
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));

import { POST } from "./route";

const requestId = "e0a643cc-8d04-4c48-bbce-17edcb46c978";
const answer = { part: 5, level: 1, itemId: "sentence", questionId: "q1", selectedAnswer: "B", correctAnswer: "B" };
const queued = { ...answer, requestId, expectedUid: "learner", answeredAtMillis: 1_791_367_200_000 };
const post = (body: unknown) => POST(new NextRequest("https://example.test/api/reading/progress", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), { params: Promise.resolve({}) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockResolvedValue({ uid: "learner" });
  mocks.save.mockResolvedValue({ saved: true, authenticated: true, correct: true, requestId, uid: "learner" });
});

describe("reading progress queue ownership", () => {
  it("sends the verified owner and stable request ID to the save service and returns its acknowledgement", async () => {
    const response = await post(queued);
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("learner", expect.objectContaining(queued));
    expect((await response.json()).data).toMatchObject({ requestId, uid: "learner", saved: true });
  });

  it("preserves queued answers when the learner is signed out", async () => {
    mocks.identity.mockResolvedValue(null);
    const response = await post(queued);
    expect(response.status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects an old account's queued answer before writing under a new session", async () => {
    mocks.identity.mockResolvedValue({ uid: "another-learner" });
    const response = await post(queued);
    expect(response.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it.each([
    { ...queued, requestId: "../receipt" },
    { ...answer, requestId },
    { ...answer, expectedUid: "learner" },
    { ...answer, answeredAtMillis: 123 },
    { ...queued, answeredAtMillis: -1 },
    { ...queued, answeredAtMillis: 1.5 },
  ])("rejects malformed or unpaired ownership identifiers", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("retains legacy guest requests without creating a queue receipt", async () => {
    mocks.identity.mockResolvedValue(null);
    mocks.save.mockResolvedValue({ saved: false, authenticated: false, correct: true });
    const response = await post(answer);
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(null, expect.objectContaining({ requestId: null, expectedUid: null }));
    expect((await response.json()).data).toEqual({ saved: false, authenticated: false, correct: true });
  });
});
