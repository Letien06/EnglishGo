import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScratchPaper from "./ScratchPaper";

beforeEach(() => {
  vi.stubGlobal("React", React);
  // jsdom deliberately has no bitmap renderer; the editor behavior doesn't
  // depend on a real canvas drawing context in these integration tests.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("scratch paper panel", () => {
  it("keeps typed content when minimized and reopened", () => {
    render(<ScratchPaper contextKey="listen:lesson-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Giấy nháp" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nội dung giấy nháp" }), { target: { value: "meeting at 9" } });
    fireEvent.click(screen.getByRole("button", { name: "Thu nhỏ giấy nháp" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Giấy nháp" }));
    expect(screen.getByRole("textbox", { name: "Nội dung giấy nháp" })).toHaveValue("meeting at 9");
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-modal");
  });

  it("prevents lesson keyboard shortcuts while editing, but leaves normal typing intact", () => {
    const shortcut = vi.fn();
    document.addEventListener("keydown", shortcut);
    render(<ScratchPaper contextKey="read:lesson-1" defaultOpen />);
    const textarea = screen.getByRole("textbox", { name: "Nội dung giấy nháp" });
    const result = fireEvent.keyDown(textarea, { key: "ArrowRight" });
    expect(result).toBe(true);
    expect(shortcut).not.toHaveBeenCalled();
    document.removeEventListener("keydown", shortcut);
  });

  it("routes controlled changes to the host and closes using Escape", () => {
    const changeText = vi.fn();
    const changeOpen = vi.fn();
    render(<ScratchPaper contextKey="exam:test-1" text="saved" onTextChange={changeText} defaultOpen onOpenChange={changeOpen} />);
    const textarea = screen.getByRole("textbox", { name: "Nội dung giấy nháp" });
    expect(textarea).toHaveValue("saved");
    fireEvent.change(textarea, { target: { value: "new notes" } });
    expect(changeText).toHaveBeenCalledWith("new notes");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(changeOpen).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mounts the drawing surface and exposes undo/clear only for a nonempty drawing", () => {
    const onStrokesChange = vi.fn();
    const strokes = [{ color: "#17212b", width: 0.01, points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }] }];
    render(<ScratchPaper contextKey="read:lesson-1" strokes={strokes} onStrokesChange={onStrokesChange} defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Vẽ tay" }));
    expect(screen.getByRole("img", { name: "Vùng vẽ giấy nháp" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    expect(onStrokesChange).toHaveBeenCalledWith([]);
  });
});
