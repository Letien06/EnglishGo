import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProgressRequest } from "@/types/listening";

const identity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: identity }));
vi.mock("@/lib/logging", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/services/distributed-concurrency", () => ({ withFirebaseRequestConcurrency: (execute: () => unknown) => execute() }));
import { learningProgressBatchHandler } from "./learning-progress-batch";
import { ApiError } from "./response";

const first = { requestId: "123e4567-e89b-42d3-a456-426614174000", expectedUid: "learner", answeredAtMillis: 1, part: 5, level: 1, itemId: "item", questionId: "q1", selectedAnswer: "A", correctAnswer: "A", modeUsed: "normal" };
const second = { ...first, requestId: "123e4567-e89b-42d3-a456-426614174001", answeredAtMillis: 2, questionId: "q2" };
function post(answers: unknown[], save = vi.fn(), minPart = 5, maxPart = 7) {
  return learningProgressBatchHandler(minPart, maxPart, save)(new NextRequest("https://example.test/api/reading/progress/batch", { method: "POST", body: JSON.stringify({ answers }) }), { params: Promise.resolve({}) });
}
beforeEach(() => { vi.clearAllMocks(); identity.mockResolvedValue({ uid: "learner" }); });

describe("batched practice saves", () => {
  it.each([[5, 7, 5], [1, 4, 3]])("authenticates once and saves each answer in order for parts %i-%i", async (minPart, maxPart, part) => {
    let inFlight = 0;
    const save = vi.fn(async (uid: string, answer: ProgressRequest) => {
      expect(++inFlight).toBe(1);
      await Promise.resolve();
      inFlight--;
      return { saved: true, authenticated: true, correct: true, uid, requestId: answer.requestId! };
    });
    const response = await post([{ ...first, part }, { ...second, part }], save, minPart, maxPart);
    expect(response.status).toBe(200);
    expect(identity).toHaveBeenCalledTimes(1);
    expect(save.mock.calls.map(([, answer]) => answer.questionId)).toEqual(["q1", "q2"]);
    expect((await response.json()).data.results).toEqual([first, second].map(({ requestId }) => ({ requestId, status: 200, response: { saved: true, authenticated: true, correct: true, uid: "learner", requestId } })));
  });

  it.each([
    [[first, { ...second, expectedUid: "other" }], 403],
    [[first, first], 400],
    [[first, { ...second, part: 1 }], 400],
    [[first, { ...second, answeredAtMillis: null }], 400],
    [[], 400],
    [Array(21).fill(first), 400],
  ])("rejects invalid envelopes before any write", async (answers, status) => {
    const save = vi.fn();
    expect((await post(answers, save)).status).toBe(status);
    expect(save).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    identity.mockResolvedValue(null);
    const save = vi.fn();
    expect((await post([first], save)).status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it.each([new Error("Unavailable"), new ApiError("Invalid question", 400)])("reports partial failure without losing successful receipts", async (error) => {
    const save = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({ saved: true, authenticated: true, uid: "learner", requestId: second.requestId });
    const response = await post([first, second], save);
    expect((await response.json()).data.results).toEqual([
      { requestId: first.requestId, status: error instanceof ApiError ? 400 : 503 },
      { requestId: second.requestId, status: 200, response: { saved: true, authenticated: true, uid: "learner", requestId: second.requestId } },
    ]);
  });
});
