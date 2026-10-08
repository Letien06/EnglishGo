import { describe, expect, it } from "vitest";
import { eraseScratchStrokes, type ScratchStroke } from "./ScratchCanvas";

const stroke = (points: Array<[number, number]>): ScratchStroke => ({
  color: "#e9b25d",
  width: 0.01,
  points: points.map(([x, y]) => ({ x, y })),
});

describe("eraseScratchStrokes", () => {
  it("splits a vector stroke around the swept eraser path", () => {
    const original = stroke([[0.1, 0.5], [0.4, 0.5], [0.7, 0.5], [0.9, 0.5]]);
    const result = eraseScratchStrokes([original], { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.6 }, { width: 100, height: 100 }, 8);
    expect(result).toHaveLength(2);
    expect(result[0].points[0].x).toBeCloseTo(0.1);
    expect(result[1].points.at(-1)?.x).toBeCloseTo(0.9);
    expect(result.every((item) => item.points.every((point) => point.x >= 0 && point.x <= 1))).toBe(true);
  });

  it("does not alter strokes outside the eraser capsule", () => {
    const original = stroke([[0.1, 0.1], [0.2, 0.1]]);
    const result = eraseScratchStrokes([original], { x: 0.8, y: 0.8 }, { x: 0.9, y: 0.9 }, { width: 100, height: 100 }, 8);
    expect(result).toEqual([original]);
  });

  it("removes a single point stroke when touched", () => {
    const result = eraseScratchStrokes([stroke([[0.5, 0.5]])], { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { width: 100, height: 100 }, 10);
    expect(result).toEqual([]);
  });
});
