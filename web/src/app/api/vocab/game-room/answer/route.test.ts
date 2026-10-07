import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/services/game-room", () => ({ submitRaceEvents: mocks.submit }));
vi.mock("@/lib/services/distributed-concurrency", () => ({ withFirebaseRequestConcurrency: (execute: () => unknown) => execute() }));
import { POST } from "./route";

const runId = "c272bb0d-57a8-4893-89ac-6afde71d9c99";
const event = { seq: 1, type: "answer", questionIndex: 0, selected: "apple", at: 100100 };
function request(body: unknown) {
  return POST(new NextRequest("http://localhost/api/vocab/game-room/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({}) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ uid: "player" });
  mocks.submit.mockResolvedValue({ revision: 1, runId, status: "countdown", serverNow: 100200, player: { score: 10 } });
});
describe("race event answer API", () => {
  it("passes authenticated identity and normalized code with server-validated events", async () => {
    const response = await request({ code: "room12", runId, events: [event], correct: false });
    expect(response.status).toBe(200);
    expect(mocks.submit).toHaveBeenCalledWith({ uid: "player" }, "ROOM12", runId, [event]);
    expect(await response.json()).toMatchObject({ success: true, data: { revision: 1, player: { score: 10 } } });
  });
  it.each([
    { code: "ROOM12", runId, events: [] },
    { code: "ROOM12", runId, events: Array.from({ length: 21 }, () => event) },
    { code: "ROOM12", runId, events: [{ ...event, seq: 1.5 }] },
    { code: "ROOM12", runId, events: [{ ...event, questionIndex: -1 }] },
    { code: "ROOM12", runId: "stale", events: [event] },
    { code: "ROOM12", questionIndex: 0, correct: true, selected: "apple" },
  ])("rejects malformed or obsolete requests before any service mutation", async body => {
    expect((await request(body)).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
