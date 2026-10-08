import React, { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScratchCanvas, { type ScratchCanvasHandle, type ScratchStroke } from "./ScratchCanvas";

const ink = (y = 0.5): ScratchStroke => ({ color: "#e9b25d", width: 0.01, points: [{ x: 0.1, y }, { x: 0.9, y }] });

function pointer(canvas: HTMLElement, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel", x: number, y: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 }, isPrimary: { value: true }, clientX: { value: x }, clientY: { value: y },
  });
  fireEvent(canvas, event);
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("scratch canvas gestures", () => {
  it("keeps the release endpoint for a quick pen line", () => {
    const onChange = vi.fn();
    render(<ScratchCanvas onChange={onChange} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 10, 20);
    pointer(canvas, "pointerup", 90, 20);
    expect(onChange.mock.calls[0][0][0].points).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }]);
  });

  it("retains a final endpoint without exceeding the point budget", () => {
    const onChange = vi.fn();
    render(<ScratchCanvas onChange={onChange} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 10, 10);
    for (let index = 0; index < 1999; index++) pointer(canvas, "pointermove", index % 2 ? 20 : 80, 20);
    pointer(canvas, "pointerup", 90, 90);
    const points = onChange.mock.calls[0][0][0].points;
    expect(points.length).toBeLessThanOrEqual(2000);
    expect(points.at(-1)).toEqual({ x: 0.9, y: 0.9 });
  });

  it.each(["disabled", "tool"])("cancels a pending gesture when %s changes", (change) => {
    const onChange = vi.fn();
    const { rerender } = render(<ScratchCanvas onChange={onChange} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 10, 10);
    pointer(canvas, "pointermove", 80, 80);
    rerender(<ScratchCanvas onChange={onChange} disabled={change === "disabled"} tool={change === "tool" ? "eraser" : "pen"} />);
    pointer(canvas, "pointerup", 90, 90);
    expect(onChange).not.toHaveBeenCalled();
    rerender(<ScratchCanvas onChange={onChange} />);
    pointer(canvas, "pointerdown", 20, 20);
    pointer(canvas, "pointerup", 30, 30);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("cancels on dimension changes before another pointer point can be added", () => {
    const onChange = vi.fn();
    render(<ScratchCanvas onChange={onChange} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 10, 10);
    vi.mocked(HTMLCanvasElement.prototype.getBoundingClientRect).mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}) });
    pointer(canvas, "pointermove", 80, 80);
    pointer(canvas, "pointerup", 90, 90);
    expect(onChange).not.toHaveBeenCalled();
    pointer(canvas, "pointerdown", 20, 20);
    pointer(canvas, "pointerup", 100, 20);
    expect(onChange.mock.calls[0][0][0].points.at(-1)).toEqual({ x: 0.5, y: 0.2 });
  });

  it("releases pointer capture on unmount without persisting an unfinished stroke", () => {
    const onChange = vi.fn();
    const { unmount } = render(<ScratchCanvas onChange={onChange} />);
    const canvas = screen.getByRole("img");
    const release = vi.fn();
    Object.defineProperty(canvas, "releasePointerCapture", { value: release });
    pointer(canvas, "pointerdown", 10, 10);
    unmount();
    expect(release).toHaveBeenCalledWith(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits one eraser gesture once and undo restores the entire original snapshot", () => {
    const original = [ink()];
    const onChange = vi.fn();
    const available = vi.fn();
    const ref = createRef<ScratchCanvasHandle>();
    render(<ScratchCanvas ref={ref} defaultStrokes={original} tool="eraser" eraserSize={100} onChange={onChange} onUndoAvailabilityChange={available} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointermove", 50, 60);
    expect(onChange).not.toHaveBeenCalled();
    pointer(canvas, "pointerup", 50, 60);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(available).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true });
    expect(ref.current?.getStrokes()).toEqual(original);
    expect(onChange).toHaveBeenLastCalledWith(original);
  });

  it("cancels erasing without changing persisted vectors", () => {
    const original = [ink()];
    const onChange = vi.fn();
    const ref = createRef<ScratchCanvasHandle>();
    render(<ScratchCanvas ref={ref} defaultStrokes={original} tool="eraser" onChange={onChange} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointermove", 50, 60);
    pointer(canvas, "pointercancel", 50, 60);
    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getStrokes()).toEqual(original);
  });

  it("rejects an eraser gesture exceeding the fragment budget and retains all ink", () => {
    const original = Array.from({ length: 300 }, () => ink());
    const onChange = vi.fn();
    const onLimit = vi.fn();
    const ref = createRef<ScratchCanvasHandle>();
    render(<ScratchCanvas ref={ref} defaultStrokes={original} tool="eraser" eraserSize={8} onChange={onChange} onLimit={onLimit} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 50, 40);
    pointer(canvas, "pointerup", 50, 60);
    expect(onLimit).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getStrokes()).toEqual(original);
  });

  it("refuses a new pen stroke at the budget without dropping the oldest ink", () => {
    const original = Array.from({ length: 300 }, () => ink());
    const onChange = vi.fn();
    const onLimit = vi.fn();
    const ref = createRef<ScratchCanvasHandle>();
    render(<ScratchCanvas ref={ref} defaultStrokes={original} onChange={onChange} onLimit={onLimit} />);
    const canvas = screen.getByRole("img");
    pointer(canvas, "pointerdown", 10, 10);
    pointer(canvas, "pointerup", 20, 20);
    expect(onLimit).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getStrokes()).toEqual(original);
  });
});
