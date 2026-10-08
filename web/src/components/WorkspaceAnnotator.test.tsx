import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspaceAnnotator, { WorkspaceAnnotationAnchor } from "./WorkspaceAnnotator";
import { workspaceAnnotationStorageKey } from "@/lib/workspace-annotations";

const context = { surface: "read" as const, resourceId: "lesson-1", questionKey: "workspace" };

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function prepareLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if ((this as HTMLElement).dataset.annotationWorkspace !== undefined) return rect(0, 0, 800, 500);
    if ((this as HTMLElement).dataset.annotationAnchor === "passage") return rect(20, 40, 500, 120);
    if ((this as HTMLElement).dataset.annotationAnchor?.startsWith("question:")) return rect(20, 190, 500, 100);
    return rect(0, 0, 800, 500);
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("React", React);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  prepareLayout();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function renderWorkspace(props: Partial<React.ComponentProps<typeof WorkspaceAnnotator>> = {}) {
  return render(
    <WorkspaceAnnotator uid="learner-a" context={context} {...props}>
      <WorkspaceAnnotationAnchor target="passage"><p>Passage text for marking</p></WorkspaceAnnotationAnchor>
      <WorkspaceAnnotationAnchor target="question:1:option:A"><button type="button">Answer A</button></WorkspaceAnnotationAnchor>
    </WorkspaceAnnotator>,
  );
}

async function activate() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Bút chú thích" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Bút chú thích" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Xong" })).toBeInTheDocument());
}

function draw(target: HTMLElement, from = [40, 70], to = [180, 95]) {
  fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(target, { pointerId: 1, isPrimary: true, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(target, { pointerId: 1, isPrimary: true, clientX: to[0], clientY: to[1] });
}

describe("workspace annotations", () => {
  it("draws across whitespace and passage, then persists on the final pointer event", async () => {
    const view = renderWorkspace();
    await activate();
    const workspace = view.container.querySelector("[data-annotation-workspace]") as HTMLElement;
    draw(workspace);
    await waitFor(() => expect(workspace.querySelector("[data-annotation-ink] path")).toBeInTheDocument());
    const raw = localStorage.getItem(workspaceAnnotationStorageKey("learner-a", context));
    expect(raw).toContain('"strokes"');
  });

  it("isolates answer clicks and keyboard shortcuts while pen mode is active", async () => {
    const answer = vi.fn();
    const view = render(<WorkspaceAnnotator uid="learner-a" context={context}><WorkspaceAnnotationAnchor target="question:1:option:A"><button onClick={answer}>Answer A</button></WorkspaceAnnotationAnchor></WorkspaceAnnotator>);
    await activate();
    const button = screen.getByRole("button", { name: "Answer A" });
    fireEvent.click(button);
    expect(answer).not.toHaveBeenCalled();
    const workspace = view.container.querySelector("[data-annotation-workspace]") as HTMLElement;
    const key = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true });
    const stopped = vi.spyOn(key, "stopPropagation");
    workspace.dispatchEvent(key);
    expect(stopped).toHaveBeenCalled();
  });

  it("offers move mode so touch scrolling is restored while the answer stays protected", async () => {
    const answer = vi.fn();
    const view = render(<WorkspaceAnnotator uid="learner-a" context={context}><WorkspaceAnnotationAnchor target="question:1:option:A"><button onClick={answer}>Answer A</button></WorkspaceAnnotationAnchor></WorkspaceAnnotator>);
    await activate();
    fireEvent.click(screen.getByRole("button", { name: "Di chuyển" }));
    expect((view.container.querySelector("[data-annotation-workspace]") as HTMLElement).style.touchAction).toBe("auto");
    fireEvent.click(screen.getByRole("button", { name: "Answer A" }));
    expect(answer).not.toHaveBeenCalled();
  });

  it("keeps separate drafts when changing the question context", async () => {
    const view = renderWorkspace();
    await activate();
    draw(view.container.querySelector("[data-annotation-workspace]") as HTMLElement);
    await waitFor(() => expect(localStorage.getItem(workspaceAnnotationStorageKey("learner-a", context))).toBeTruthy());
    view.rerender(<WorkspaceAnnotator uid="learner-a" context={{ ...context, resourceId: "lesson-2" }}><WorkspaceAnnotationAnchor target="passage"><p>Next lesson</p></WorkspaceAnnotationAnchor></WorkspaceAnnotator>);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Xong" })).not.toBeInTheDocument());
    expect(localStorage.getItem(workspaceAnnotationStorageKey("learner-a", { ...context, resourceId: "lesson-2" }))).toBeNull();
  });

  it("supports erasing and undoing the last drawing", async () => {
    const view = renderWorkspace();
    await activate();
    const workspace = view.container.querySelector("[data-annotation-workspace]") as HTMLElement;
    draw(workspace, [40, 70], [180, 95]);
    await waitFor(() => expect(workspace.querySelectorAll("[data-annotation-ink] path")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Bút" }));
    fireEvent.click(screen.getByRole("button", { name: "Tẩy" }));
    expect((view.container.querySelector("[data-annotation-workspace]") as HTMLElement).style.cursor).toContain("url(");
    draw(workspace, [50, 75], [170, 90]);
    fireEvent.click(screen.getByRole("button", { name: "Hoàn tác" }));
    await waitFor(() => expect(workspace.querySelectorAll("[data-annotation-ink] path")).toHaveLength(1));
  });

  it("does not activate or draw while a submit/exit modal disables it", async () => {
    const view = renderWorkspace({ disabled: true });
    const launcher = screen.getByRole("button", { name: "Bút chú thích" });
    expect(launcher).toBeDisabled();
    fireEvent.pointerDown(view.container.querySelector("[data-annotation-workspace]")!, { pointerId: 1, isPrimary: true, button: 0, clientX: 40, clientY: 70 });
    expect(screen.queryByRole("button", { name: "Xong" })).not.toBeInTheDocument();
  });
});
