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

import {
  normalizeCurrentQuestionIndex,
  normalizeDraftPayload,
  normalizeSessionConfig,
  suggestedMinutes,
} from "./practice";

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

describe("practice draft normalization", () => {
  it("keeps only allowed question ids and clamps current question index", () => {
    const config = normalizeSessionConfig({ mode: "part", parts: [5], durationMinutes: 18 }, 99);
    const payload = normalizeDraftPayload(
      JSON.stringify({
        answers: {
          501: { selectedOptionId: 1001, textResponse: " A " },
          999: { selectedOptionId: 1999 },
          bad: { selectedOptionId: 1 },
        },
        markedQuestionIds: [501, 999, 501, "bad"],
      }),
      new Set([501, 502]),
      config,
      1000,
      2000,
      normalizeCurrentQuestionIndex(99, 2),
    );

    expect(JSON.parse(payload)).toEqual({
      answers: {
        501: { selectedOptionId: 1001, textResponse: " A " },
      },
      markedQuestionIds: [501],
      currentQuestionIndex: 1,
      startedAtMillis: 1000,
      updatedAtMillis: 2000,
      config,
    });
  });

  it("handles invalid draft JSON as an empty draft", () => {
    const config = normalizeSessionConfig({ mode: "part", parts: [6], durationMinutes: 10 }, 88);
    expect(JSON.parse(normalizeDraftPayload("{bad", new Set([1]), config, 10, 20, 0))).toEqual({
      answers: {},
      markedQuestionIds: [],
      currentQuestionIndex: 0,
      startedAtMillis: 10,
      updatedAtMillis: 20,
      config,
    });
  });
});
