import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/db", () => ({ adminDb: {} }));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: vi.fn(() => ({ serverTimestamp: true })) },
}));

import {
  currentPetWeekKey,
  derivePetStatus,
  evolutionForCareXp,
  nextEvolutionForCareXp,
  PET_FOOD_CATALOG,
} from "./pet";

describe("pet evolution", () => {
  it.each([
    [0, 1],
    [149, 1],
    [150, 2],
    [499, 2],
    [500, 3],
    [1_200, 4],
    [2_500, 5],
  ])("uses stage %i for %i care XP", (careXp, stage) => {
    expect(evolutionForCareXp(careXp).stage).toBe(stage);
  });

  it("finds the next permanent evolution threshold", () => {
    expect(nextEvolutionForCareXp(0)).toBe(150);
    expect(nextEvolutionForCareXp(149)).toBe(150);
    expect(nextEvolutionForCareXp(2_500)).toBeNull();
  });
});

describe("pet status", () => {
  it("decays fullness and happiness from the stored timestamp and clamps values", () => {
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);
    expect(derivePetStatus({ fullness: 7, happiness: 4, lastStatusAtMillis: now - 40 * 60 * 60 * 1000 }, now)).toMatchObject({
      fullness: 0,
      happiness: 0,
      mood: "hungry",
    });
  });

  it("uses happy, content and sleepy moods consistently", () => {
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);
    expect(derivePetStatus({ fullness: 70, happiness: 70, lastStatusAtMillis: now }, now).mood).toBe("happy");
    expect(derivePetStatus({ fullness: 55, happiness: 55, lastStatusAtMillis: now }, now).mood).toBe("content");
    expect(derivePetStatus({ fullness: 55, happiness: 20, lastStatusAtMillis: now }, now).mood).toBe("sleepy");
  });
});

describe("pet economy configuration", () => {
  it("has non-negative, internally consistent food values", () => {
    for (const food of Object.values(PET_FOOD_CATALOG)) {
      expect(food.price).toBeGreaterThan(0);
      expect(food.fullness).toBeGreaterThan(0);
      expect(food.happiness).toBeGreaterThanOrEqual(0);
      expect(food.careXp).toBeGreaterThan(0);
    }
  });

  it("uses Ho Chi Minh time for weekly boards", () => {
    expect(currentPetWeekKey(new Date("2026-07-15T12:00:00.000Z"))).toBe("2026-W29");
  });
});
