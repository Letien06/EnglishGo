import { describe, expect, it } from "vitest";
import { createActiveStudyTracker } from "./use-active-study-timer";

describe("createActiveStudyTracker", () => {
  it("pauses when tab is hidden and resumes when visible again", () => {
    const tracker = createActiveStudyTracker(180_000);
    const start = 1_000_000;
    tracker.markActivity(start);

    expect(tracker.tick(start + 1_000, true)).toBe(1);
    expect(tracker.tick(start + 2_000, true)).toBe(2);
    // Tab hidden for 2 ticks: neither session nor item time should advance
    expect(tracker.tick(start + 3_000, false)).toBe(2);
    expect(tracker.tick(start + 4_000, false)).toBe(2);
    // Tab visible again
    expect(tracker.tick(start + 5_000, true)).toBe(3);
    expect(tracker.consumeItemSeconds()).toBe(3);
    // Consuming resets per-item counter while keeping session counter intact
    expect(tracker.getSessionSeconds()).toBe(3);
    expect(tracker.consumeItemSeconds()).toBe(1);
  });

  it("stops counting after idle timeout until next learner interaction", () => {
    const tracker = createActiveStudyTracker(10_000);
    const start = 500_000;
    tracker.markActivity(start);

    expect(tracker.tick(start + 5_000, true)).toBe(1);
    // Beyond 10s idle threshold
    expect(tracker.tick(start + 15_000, true)).toBe(1);
    expect(tracker.tick(start + 20_000, true)).toBe(1);
    // Learner interacts again
    tracker.markActivity(start + 21_000);
    expect(tracker.tick(start + 22_000, true)).toBe(2);
  });
});
