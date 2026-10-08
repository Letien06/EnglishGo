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
