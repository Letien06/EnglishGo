import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/db", () => ({
  adminDb: {},
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => ({ serverTimestamp: true })),
  },
}));

import { summarizePracticeLeaderboardAttempt } from "./leaderboard";

const baseScoreBreakdown = {
  listening: {
    skill: "LISTENING" as const,
    correct: 90,
    total: 100,
    selectedParts: [1, 2, 3, 4],
    coverageQuestions: 100,
    coveragePercent: 100,
    equivalentCorrect100: 90,
    projectedScaledScore: 445,
    questionWeight: 4.9,
  },
  reading: {
    skill: "READING" as const,
    correct: 85,
    total: 100,
    selectedParts: [5, 6, 7],
    coverageQuestions: 100,
    coveragePercent: 100,
    equivalentCorrect100: 85,
    projectedScaledScore: 420,
    questionWeight: 4.9,
  },
  totalProjectedScore: 865,
  maxScore: 990,
  note: "estimate",
};

describe("summarizePracticeLeaderboardAttempt", () => {
  it("marks a standard full exam as verified and scores on 990 scale", () => {
    const result = summarizePracticeLeaderboardAttempt({
      testId: 123,
      config: {
        mode: "exam",
        parts: [1, 2, 3, 4, 5, 6, 7],
        durationMinutes: 120,
        sessionKey: "practice-123-exam",
      },
      scoreBreakdown: baseScoreBreakdown,
      correctCount: 175,
      questionCount: 200,
      unansweredCount: 3,
      elapsedMillis: 75 * 60 * 1000,
      expired: false,
    });

    expect(result).toMatchObject({
      scope: "EXAM",
      eligibility: "VERIFIED",
      officialConfig: true,
      leaderboardScore: 865,
      leaderboardMaxScore: 990,
      rawCorrect: 175,
      rawTotal: 200,
      unansweredCount: 3,
      ineligibleReason: null,
    });
  });

  it("marks full listening as verified and scores on 495 scale", () => {
    const result = summarizePracticeLeaderboardAttempt({
      testId: 123,
      config: {
        mode: "part",
        parts: [1, 2, 3, 4],
        durationMinutes: 64,
        sessionKey: "practice-123-listening",
      },
      scoreBreakdown: { ...baseScoreBreakdown, reading: null, totalProjectedScore: null, maxScore: 495 },
      correctCount: 90,
      questionCount: 100,
      unansweredCount: 1,
      elapsedMillis: 30 * 60 * 1000,
      expired: false,
    });

    expect(result).toMatchObject({
      scope: "LISTENING",
      eligibility: "VERIFIED",
      leaderboardScore: 445,
      leaderboardMaxScore: 495,
    });
  });

  it("keeps single-part practice out of the main leaderboard", () => {
    const result = summarizePracticeLeaderboardAttempt({
      testId: 123,
      config: {
        mode: "part",
        parts: [5],
        durationMinutes: 18,
        sessionKey: "practice-123-part-5",
      },
      scoreBreakdown: { ...baseScoreBreakdown, listening: null, totalProjectedScore: null, maxScore: 495 },
      correctCount: 25,
      questionCount: 30,
      unansweredCount: 0,
      elapsedMillis: 12 * 60 * 1000,
      expired: false,
    });

    expect(result).toMatchObject({
      scope: "PART_PRACTICE",
      eligibility: "PRACTICE_RETRY",
      leaderboardScore: 0,
      ineligibleReason: "not_official_scope",
    });
  });

  it("marks expired or unrealistically fast attempts as suspicious", () => {
    const expired = summarizePracticeLeaderboardAttempt({
      testId: 123,
      config: {
        mode: "exam",
        parts: [1, 2, 3, 4, 5, 6, 7],
        durationMinutes: 120,
        sessionKey: "practice-123-exam",
      },
      scoreBreakdown: baseScoreBreakdown,
      correctCount: 175,
      questionCount: 200,
      unansweredCount: 3,
      elapsedMillis: 121 * 60 * 1000,
      expired: true,
    });
    const tooFast = summarizePracticeLeaderboardAttempt({
      testId: 123,
      config: {
        mode: "exam",
        parts: [1, 2, 3, 4, 5, 6, 7],
        durationMinutes: 120,
        sessionKey: "practice-123-exam",
      },
      scoreBreakdown: baseScoreBreakdown,
      correctCount: 175,
      questionCount: 200,
      unansweredCount: 3,
      elapsedMillis: 2 * 60 * 1000,
      expired: false,
    });

    expect(expired).toMatchObject({ eligibility: "SUSPICIOUS", ineligibleReason: "expired" });
    expect(tooFast).toMatchObject({ eligibility: "SUSPICIOUS", ineligibleReason: "too_fast" });
  });
});
