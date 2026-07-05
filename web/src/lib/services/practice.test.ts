import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/db", () => ({
  adminDb: {},
}));

vi.mock("./dautoeic", () => ({}));

vi.mock("./community", () => ({
  addScore: vi.fn(),
}));

vi.mock("./dautoeic-test-index", () => ({
  hasTestIndex: vi.fn(),
  queryTestIndex: vi.fn(),
  writeTestIndex: vi.fn(),
}));

import { normalizeSessionConfig, suggestedMinutes } from "./practice";

describe("normalizeSessionConfig", () => {
  it("defaults to full exam mode with all parts and 120 minutes", () => {
    expect(normalizeSessionConfig(undefined, 123)).toEqual({
      mode: "exam",
      parts: [1, 2, 3, 4, 5, 6, 7],
      durationMinutes: 120,
      sessionKey: "practice-123-exam-parts-1-2-3-4-5-6-7-time-120",
    });
  });

  it("normalizes part mode, sorts unique parts, and preserves valid duration", () => {
    expect(
      normalizeSessionConfig(
        {
          mode: "part",
          parts: "7,5,5,6",
          durationMinutes: "70",
        },
        456,
      ),
    ).toEqual({
      mode: "part",
      parts: [5, 6, 7],
      durationMinutes: 70,
      sessionKey: "practice-456-part-parts-5-6-7-time-70",
    });
  });

  it("treats selecting all parts as exam mode", () => {
    expect(
      normalizeSessionConfig(
        {
          mode: "part",
          parts: [1, 2, 3, 4, 5, 6, 7],
          durationMinutes: 125,
        },
        789,
      ).mode,
    ).toBe("exam");
  });

  it("clamps duration between one and 180 minutes", () => {
    expect(normalizeSessionConfig({ durationMinutes: -10 }, 1).durationMinutes).toBe(1);
    expect(normalizeSessionConfig({ durationMinutes: 999 }, 1).durationMinutes).toBe(180);
  });
});

describe("suggestedMinutes", () => {
  it("uses TOEIC part suggestions and full-test default", () => {
    expect(suggestedMinutes([5])).toBe(18);
    expect(suggestedMinutes([5, 6, 7])).toBe(70);
    expect(suggestedMinutes([1, 2, 3, 4, 5, 6, 7])).toBe(120);
  });
});
