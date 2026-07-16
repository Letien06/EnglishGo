import { describe, expect, it } from "vitest";
import { buildProgressReport, type ProgressAttemptInput } from "./progress-report";

function attempt(input: Partial<ProgressAttemptInput> & Pick<ProgressAttemptInput, "attemptId" | "submittedAtMillis">): ProgressAttemptInput {
  return {
    correctCount: 70,
    questionCount: 100,
    partBreakdown: [
      { part: 2, skill: "LISTENING", correct: 20, total: 25 },
      { part: 5, skill: "READING", correct: 20, total: 30 },
    ],
    scoreBreakdown: {
      totalProjectedScore: 650,
      listening: { projectedScaledScore: 350 },
      reading: { projectedScaledScore: 300 },
    },
    ...input,
  };
}

describe("buildProgressReport", () => {
  it("aggregates accuracy and identifies strong and weak TOEIC parts", () => {
    const report = buildProgressReport([
      attempt({ attemptId: 1, submittedAtMillis: 1_000, correctCount: 60 }),
      attempt({ attemptId: 2, submittedAtMillis: 2_000, correctCount: 80, partBreakdown: [
        { part: 2, skill: "LISTENING", correct: 24, total: 25 },
        { part: 5, skill: "READING", correct: 10, total: 30 },
      ] }),
    ]);

    expect(report.totalAttempts).toBe(2);
    expect(report.overallAccuracy).toBe(70);
    expect(report.strongestParts[0]).toMatchObject({ part: 2, accuracy: 88 });
    expect(report.weakestParts[0]).toMatchObject({ part: 5, accuracy: 50 });
  });

  it("does not forecast a TOEIC range until there are three full-score observations", () => {
    const report = buildProgressReport([
      attempt({ attemptId: 1, submittedAtMillis: 1_000, scoreBreakdown: { totalProjectedScore: 600, listening: null, reading: null } }),
      attempt({ attemptId: 2, submittedAtMillis: 2_000, scoreBreakdown: { totalProjectedScore: 625, listening: null, reading: null } }),
    ]);

    expect(report.forecast).toMatchObject({ available: false, sampleSize: 2, currentScore: 625 });
  });

  it("creates a bounded 28-day estimate from at least three full attempts", () => {
    const report = buildProgressReport([
      attempt({ attemptId: 1, submittedAtMillis: 1, scoreBreakdown: { totalProjectedScore: 500, listening: null, reading: null } }),
      attempt({ attemptId: 2, submittedAtMillis: 7 * 86_400_000, scoreBreakdown: { totalProjectedScore: 550, listening: null, reading: null } }),
      attempt({ attemptId: 3, submittedAtMillis: 14 * 86_400_000, scoreBreakdown: { totalProjectedScore: 600, listening: null, reading: null } }),
    ]);

    expect(report.forecast.available).toBe(true);
    expect(report.forecast.predictedScore).toBe(700);
    expect(report.forecast.lowerBound).toBeLessThanOrEqual(report.forecast.predictedScore ?? 0);
    expect(report.forecast.upperBound).toBeGreaterThanOrEqual(report.forecast.predictedScore ?? 0);
  });
});
