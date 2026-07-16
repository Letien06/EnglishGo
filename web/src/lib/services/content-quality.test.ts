import { describe, expect, it } from "vitest";
import { qualityRiskScore, questionQualityId } from "./content-quality";

describe("content quality scoring", () => {
  it("weights established error patterns above a single failed answer", () => {
    expect(qualityRiskScore(1, 1)).toBeLessThan(qualityRiskScore(4, 5));
  });

  it("elevates learner reports without making them the only signal", () => {
    expect(qualityRiskScore(2, 10, 2)).toBeGreaterThan(qualityRiskScore(2, 10));
  });

  it("uses a stable test-question key", () => {
    expect(questionQualityId(123, 456)).toBe("123_456");
  });
});
