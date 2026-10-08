import { describe, expect, it } from "vitest";
import {
  clearScratchPaper,
  loadScratchPaper,
  saveScratchPaper,
  scratchPaperStorageKey,
  type ScratchPaperContext,
  type ScratchPaperDraft,
  type ScratchPaperStorage,
} from "./scratch-paper";

function memoryStorage(initial: Record<string, string> = {}): ScratchPaperStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const context: ScratchPaperContext = { surface: "read", resourceId: "part-7-test-1" };
const draft: ScratchPaperDraft = {
  text: "Check the invoice number",
  strokes: [{ color: "#f59e0b", width: 3, points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.3 }] }],
};

describe("scratch paper device storage", () => {
  it("round trips text and normalized drawing strokes", () => {
    const storage = memoryStorage();
    expect(saveScratchPaper("learner-a", context, draft, storage).status).toBe("saved");
    const loaded = loadScratchPaper("learner-a", context, storage);
    expect(loaded.status).toBe("ready");
    expect(loaded.state.text).toBe(draft.text);
    expect(loaded.state.strokes).toEqual(draft.strokes);
    expect(loaded.state.savedAt).toEqual(expect.any(String));
  });

  it("isolates learners, surfaces, and stable resources", () => {
    const storage = memoryStorage();
    const otherSurface: ScratchPaperContext = { ...context, surface: "listen" };
    const otherResource: ScratchPaperContext = { ...context, resourceId: "part-7-test-2" };
    saveScratchPaper("learner-a", context, draft, storage);
    expect(loadScratchPaper("learner-b", context, storage).state.text).toBe("");
    expect(loadScratchPaper("learner-a", otherSurface, storage).state.text).toBe("");
    expect(loadScratchPaper("learner-a", otherResource, storage).state.text).toBe("");
    expect(scratchPaperStorageKey("learner-a", context)).not.toBe(scratchPaperStorageKey("learner-b", context));
    expect(scratchPaperStorageKey("learner-a", context)).not.toBe(scratchPaperStorageKey("learner-a", otherSurface));
  });

  it("returns a safe empty state when no draft exists", () => {
    const result = loadScratchPaper("learner-a", context, memoryStorage());
    expect(result).toMatchObject({ status: "ready", state: { text: "", strokes: [], savedAt: null } });
  });

  it("does not overwrite a corrupt payload during autosave", () => {
    const storage = memoryStorage({ [scratchPaperStorageKey("learner-a", context)]: "{\"version\":1,\"text\":\"broken\"}" });
    const result = saveScratchPaper("learner-a", context, draft, storage);
    expect(result.status).toBe("corrupt");
    expect(storage.values.get(scratchPaperStorageKey("learner-a", context))).toContain("broken");
    expect(loadScratchPaper("learner-a", context, storage).status).toBe("corrupt");
  });

  it("reports storage failures without throwing", () => {
    const unavailable: ScratchPaperStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(loadScratchPaper("learner-a", context, unavailable).status).toBe("unavailable");
    expect(saveScratchPaper("learner-a", context, draft, unavailable).status).toBe("unavailable");
    expect(clearScratchPaper("learner-a", context, unavailable).status).toBe("unavailable");
  });

  it("keeps the last good draft when a quota failure rejects the next save", () => {
    const storage = memoryStorage();
    saveScratchPaper("learner-a", context, draft, storage);
    const quotaStorage = { ...storage, setItem: () => { throw new Error("quota exceeded"); } };
    expect(saveScratchPaper("learner-a", context, { ...draft, text: "new unsaved text" }, quotaStorage).status).toBe("unavailable");
    expect(loadScratchPaper("learner-a", context, storage).state.text).toBe(draft.text);
  });

  it("rejects drawing points outside the normalized canvas without replacing valid data", () => {
    const storage = memoryStorage();
    saveScratchPaper("learner-a", context, draft, storage);
    const badDrawing = { text: "", strokes: [{ color: "#000", width: 0.01, points: [{ x: Number.NaN, y: 0.2 }] }] };
    expect(saveScratchPaper("learner-a", context, badDrawing, storage).status).toBe("invalid");
    badDrawing.strokes[0].points[0].x = 1.1;
    expect(saveScratchPaper("learner-a", context, badDrawing, storage).status).toBe("invalid");
    expect(loadScratchPaper("learner-a", context, storage).state.text).toBe(draft.text);
  });

  it("allows explicitly clearing a corrupt paper to recover autosave", () => {
    const storage = memoryStorage({ [scratchPaperStorageKey("learner-a", context)]: "corrupt" });
    expect(clearScratchPaper("learner-a", context, storage).status).toBe("cleared");
    expect(saveScratchPaper("learner-a", context, draft, storage).status).toBe("saved");
  });

  it("validates input before touching storage", () => {
    const storage = memoryStorage();
    expect(saveScratchPaper("", context, draft, storage).status).toBe("invalid");
    expect(saveScratchPaper("learner-a", context, { text: "", strokes: [{ color: "", width: 0, points: [] }] }, storage).status).toBe("invalid");
    expect(loadScratchPaper("learner-a", { surface: "read", resourceId: "" }, storage).status).toBe("invalid");
    expect(storage.values.size).toBe(0);
  });

  it("clears one paper without affecting another context", () => {
    const storage = memoryStorage();
    const other: ScratchPaperContext = { ...context, resourceId: "different" };
    saveScratchPaper("learner-a", context, draft, storage);
    saveScratchPaper("learner-a", other, draft, storage);
    expect(clearScratchPaper("learner-a", context, storage).status).toBe("cleared");
    expect(loadScratchPaper("learner-a", context, storage).state.text).toBe("");
    expect(loadScratchPaper("learner-a", other, storage).state.text).toBe(draft.text);
    expect(clearScratchPaper("learner-a", context, storage).status).toBe("missing");
  });
});

