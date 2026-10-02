import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ collection: vi.fn(), getPart: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: { collection: mocks.collection } }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => true, contentCacheKey: () => "drive-practice-test" }));
vi.mock("./dautoeic", () => ({
  listTests: async () => [{ id: "external", name: "Test", totalQuestions: 1 }],
  routeTestId: () => 123,
  routeQuestionId: () => 456,
  optionId: (_id: number, letter: string) => letter.charCodeAt(0),
  getPart: mocks.getPart,
}));

import { getPracticeSession } from "./practice";

describe("Drive-backed exam content with Firestore learner drafts", () => {
  it("writes only the learner draft, not practice content or answer caches", async () => {
    const query = { doc: vi.fn(), collection: vi.fn(), get: mocks.get, set: mocks.set };
    query.doc.mockReturnValue(query);
    query.collection.mockImplementation((name) => {
      expect(name).toBe("practiceDrafts");
      return query;
    });
    mocks.collection.mockImplementation((name) => {
      expect(name).toBe("users");
      return query;
    });
    mocks.get.mockResolvedValue({ exists: false });
    mocks.set.mockResolvedValue(undefined);
    mocks.getPart.mockResolvedValue({ questions: [{ id: "question", testId: "external", part: 5, questionText: "Question", optionA: "Answer", correctAnswer: "A" }] });
    const session = await getPracticeSession(123, "learner", { mode: "part", parts: [5], durationMinutes: 18 });
    expect(session.questions).toHaveLength(1);
    expect(mocks.getPart).toHaveBeenCalledWith("external", 5);
    expect(mocks.collection).toHaveBeenCalledWith("users");
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });
});
