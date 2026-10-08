import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/read/practice", query: "part=1" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

import ScratchPaperHost from "./ScratchPaperHost";
import { loadScratchPaper } from "@/lib/scratch-paper";

function settle() {
  act(() => { vi.runOnlyPendingTimers(); });
}

function openTextEditor() {
  fireEvent.click(screen.getByRole("button", { name: "Giấy nháp" }));
  return screen.getByRole("textbox", { name: "Nội dung giấy nháp" });
}

function ensureTextEditor() {
  return screen.queryByRole("textbox", { name: "Nội dung giấy nháp" }) ?? openTextEditor();
}

beforeEach(() => {
  vi.useFakeTimers();
  navigation.pathname = "/read/practice";
  navigation.query = "part=1";
  window.localStorage.clear();
  vi.stubGlobal("React", React);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("ScratchPaperHost route and learner isolation", () => {
  it("keeps the current draft when only the question query changes", () => {
    const view = render(<ScratchPaperHost uid="learner-a" ready />);
    settle();
    const textarea = openTextEditor();
    fireEvent.change(textarea, { target: { value: "remember this phrase" } });

    navigation.query = "part=1&q=2&mode=flip";
    view.rerender(<ScratchPaperHost uid="learner-a" ready />);
    settle();

    expect(screen.getByRole("textbox", { name: "Nội dung giấy nháp" })).toHaveValue("remember this phrase");
  });

  it("flushes a draft immediately when switching resources and restores it on return", () => {
    const view = render(<ScratchPaperHost uid="learner-a" ready />);
    settle();
    fireEvent.change(openTextEditor(), { target: { value: "part one note" } });

    // Switch before the 350 ms debounce. The old resource must still be
    // persisted by the route-change cleanup.
    navigation.query = "part=2";
    view.rerender(<ScratchPaperHost uid="learner-a" ready />);
    settle();
    expect(ensureTextEditor()).toHaveValue("");

    navigation.query = "part=1";
    view.rerender(<ScratchPaperHost uid="learner-a" ready />);
    settle();
    expect(ensureTextEditor()).toHaveValue("part one note");
  });

  it("never exposes one learner's paper to another learner", () => {
    const view = render(<ScratchPaperHost uid="learner-a" ready />);
    settle();
    fireEvent.change(openTextEditor(), { target: { value: "private learner note" } });

    view.rerender(<ScratchPaperHost uid="learner-b" ready />);
    settle();
    expect(ensureTextEditor()).toHaveValue("");

    view.rerender(<ScratchPaperHost uid="learner-a" ready />);
    settle();
    expect(ensureTextEditor()).toHaveValue("private learner note");
  });

  it("does not load or render the launcher outside supported workspaces", () => {
    navigation.pathname = "/hub";
    render(<ScratchPaperHost uid="learner-a" ready />);
    expect(screen.queryByRole("button", { name: "Giấy nháp" })).not.toBeInTheDocument();
  });

  it("does not persist while the session identity is unresolved", () => {
    render(<ScratchPaperHost uid={null} ready={false} />);
    expect(screen.queryByRole("button", { name: "Giấy nháp" })).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(loadScratchPaper("learner-a", { surface: "read", resourceId: "/read/practice|part=1" }).state.text).toBe("");
  });
});

