import { describe, expect, it } from "vitest";
import { clearWorkspaceAnnotations, loadWorkspaceAnnotations, saveWorkspaceAnnotations, validWorkspaceAnnotations, workspaceAnnotationStorageKey, type WorkspaceAnnotationState, type WorkspaceAnnotationStorage } from "./workspace-annotations";

function storage(): WorkspaceAnnotationStorage { const map = new Map<string, string>(); return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: (key) => { map.delete(key); } }; }
const context = { surface: "read" as const, resourceId: "reading-test", questionKey: "workspace" };
const state: WorkspaceAnnotationState = { legacyImported: false, strokes: [{ id: "line-1", anchor: "question", layoutWidth: 900, anchorWidth: 700, points: [{ x: 12, y: 18 }, { x: 280, y: -19 }], color: "#dc4f54", width: 3 }] };

describe("workspace annotation storage", () => {
  it("round-trips signed anchor-local coordinates and isolates scope", () => { const target = storage(); expect(saveWorkspaceAnnotations("u1", context, state, target).status).toBe("saved"); expect(loadWorkspaceAnnotations("u1", context, target).state).toEqual(state); expect(loadWorkspaceAnnotations("u2", context, target).state.strokes).toEqual([]); expect(loadWorkspaceAnnotations("u1", { ...context, resourceId: "other" }, target).state.strokes).toEqual([]); });
  it("clones loaded points", () => { const target = storage(); saveWorkspaceAnnotations("u1", context, state, target); const loaded = loadWorkspaceAnnotations("u1", context, target); loaded.state.strokes[0].points[0].x = -99; expect(loadWorkspaceAnnotations("u1", context, target).state.strokes[0].points[0].x).toBe(12); });
  it("rejects invalid dimensions, coordinates, widths and duplicate limits", () => { expect(validWorkspaceAnnotations({ ...state, strokes: [{ ...state.strokes[0], layoutWidth: 0 }] })).toBe(false); expect(validWorkspaceAnnotations({ ...state, strokes: [{ ...state.strokes[0], points: [{ x: 100001, y: 0 }] }] })).toBe(false); expect(validWorkspaceAnnotations({ ...state, strokes: [{ ...state.strokes[0], width: 0.1 }] })).toBe(false); expect(validWorkspaceAnnotations({ ...state, strokes: Array.from({ length: 301 }, (_, i) => ({ ...state.strokes[0], id: `s-${i}` })) })).toBe(false); });
  it("rejects duplicate stroke ids and invalid context scope", () => { expect(validWorkspaceAnnotations({ ...state, strokes: [state.strokes[0], state.strokes[0]] })).toBe(false); const target = storage(); expect(loadWorkspaceAnnotations("u1", { ...context, questionKey: "x".repeat(181) }, target).status).toBe("unavailable"); expect(loadWorkspaceAnnotations("u1", { ...context, resourceId: "x".repeat(801) }, target).status).toBe("unavailable"); expect(loadWorkspaceAnnotations("u1", { ...context, surface: "bad" as "read" }, target).status).toBe("unavailable"); });
  it("does not replace corrupt data until clear", () => { const target = storage(); const key = workspaceAnnotationStorageKey("u1", context); target.setItem(key, "{broken"); expect(loadWorkspaceAnnotations("u1", context, target).status).toBe("corrupt"); expect(saveWorkspaceAnnotations("u1", context, state, target).status).toBe("unavailable"); expect(target.getItem(key)).toBe("{broken"); expect(clearWorkspaceAnnotations("u1", context, target)).toBe(true); });
  it("reports storage failures", () => { const fail = () => { throw new Error("quota"); }; expect(loadWorkspaceAnnotations("u1", context, { getItem: fail, setItem: fail, removeItem: fail }).status).toBe("unavailable"); expect(saveWorkspaceAnnotations("u1", context, state, { getItem: () => null, setItem: fail, removeItem: fail }).status).toBe("unavailable"); expect(clearWorkspaceAnnotations("u1", context, { getItem: () => null, setItem: fail, removeItem: fail })).toBe(false); });
  it("enforces point budgets without replacing existing ink", () => {
    const target = storage(); saveWorkspaceAnnotations("u1", context, state, target);
    const key = workspaceAnnotationStorageKey("u1", context), previous = target.getItem(key);
    const stroke = state.strokes[0];
    const overStroke = { ...state, strokes: [{ ...stroke, points: Array.from({ length: 2001 }, () => ({ x: 12, y: 19 })) }] };
    expect(saveWorkspaceAnnotations("u1", context, overStroke, target).status).toBe("invalid");
    const overGlobal = { ...state, strokes: Array.from({ length: 31 }, (_, index) => ({ ...stroke, id: `s-${index}`, points: Array.from({ length: 2000 }, () => ({ x: 12, y: 19 })) })) };
    expect(saveWorkspaceAnnotations("u1", context, overGlobal, target).status).toBe("invalid");
    expect(target.getItem(key)).toBe(previous);
  });
  it("preserves previously saved ink on quota failure", () => {
    const target = storage(); saveWorkspaceAnnotations("u1", context, state, target);
    const key = workspaceAnnotationStorageKey("u1", context), previous = target.getItem(key);
    expect(saveWorkspaceAnnotations("u1", context, { ...state, legacyImported: true }, { ...target, setItem: () => { throw new Error("quota"); } }).status).toBe("unavailable");
    expect(target.getItem(key)).toBe(previous);
  });
});
