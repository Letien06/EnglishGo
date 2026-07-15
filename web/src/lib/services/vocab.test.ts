import { beforeEach, describe, expect, it, vi } from "vitest";

const historySet = vi.fn();
const historyDoc = vi.fn(() => ({ set: historySet }));
const historyCollection = vi.fn(() => ({ doc: historyDoc }));
const userDoc = vi.fn(() => ({ collection: historyCollection }));
const usersCollection = vi.fn(() => ({ doc: userDoc }));

vi.mock("@/lib/firestore/db", () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name !== "users") throw new Error(`Unexpected collection ${name}`);
      return usersCollection();
    }),
  },
}));

vi.mock("crypto", () => ({
  default: { randomInt: vi.fn(() => 1234) },
  randomInt: vi.fn(() => 1234),
}));

vi.mock("./rate-limit", () => ({
  enforceDailyActionLimit: vi.fn(),
}));

vi.mock("./study-activity", () => ({
  getStoredStudyStreakSummary: vi.fn(),
  getStudyStreak: vi.fn(),
  recordStudyActivity: vi.fn(() => Promise.resolve()),
}));

describe("recordStudyHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    historySet.mockResolvedValue(undefined);
    vi.setSystemTime(new Date("2026-07-09T10:00:00.000Z"));
  });

  it("stores a bounded history document and detects DAUTOEIC source", async () => {
    const { recordStudyHistory } = await import("./vocab");

    const result = await recordStudyHistory("user-1", {
      setId: 12,
      externalTestId: "toeic-1",
      externalPartId: "part-5",
      title: "Part 5 vocab",
      mode: "Quiz",
      startedAtMillis: 100,
      totalWords: 20,
      correctWords: 15,
      wrongWords: 5,
      accuracy: 120,
      score: 300,
    });

    expect(result.id).toBe("1783591200000-1234");
    expect(historyCollection).toHaveBeenCalledWith("vocabStudyHistory");
    expect(historyDoc).toHaveBeenCalledWith("1783591200000-1234");
    expect(historySet).toHaveBeenCalledWith(expect.objectContaining({
      id: "1783591200000-1234",
      uid: "user-1",
      source: "DAUTOEIC",
      setId: 12,
      externalTestId: "toeic-1",
      externalPartId: "part-5",
      accuracy: 100,
      totalWords: 20,
      correctWords: 15,
      wrongWords: 5,
      score: 300,
    }));
  });
});

describe("vocabDayStartForMillis", () => {
  it("uses the Vietnam learning day instead of the server timezone", async () => {
    const { vocabDayStartForMillis } = await import("./vocab");

    const afterVietnamMidnight = Date.parse("2026-07-15T17:30:00.000Z");

    expect(vocabDayStartForMillis(afterVietnamMidnight)).toBe(
      Date.parse("2026-07-15T17:00:00.000Z"),
    );
  });
});
