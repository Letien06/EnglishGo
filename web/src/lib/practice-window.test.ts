import { describe, expect, it } from "vitest";
import { practiceNavigationTarget, practiceWindowInfo, selectPracticeWindow } from "./practice-window";
import type { DauToeicDifficultySession, DauToeicPracticeItem } from "@/types/dautoeic";

const session: DauToeicDifficultySession = { part: 7, level: 3, title: "Part 7", total: 531, items: Array.from({ length: 531 }, (_, index) => ({ id: `passage-${index}`, questions: [] } as unknown as DauToeicPracticeItem)) };

describe("bounded difficulty practice windows", () => {
  it("loads the requested absolute position without sending the preceding passages", () => {
    const result = selectPracticeWindow(session, "134");
    expect(result.initialIndex).toBe(9);
    expect(result.session.windowOffset).toBe(125);
    expect(result.session.total).toBe(531);
    expect(result.session.items).toHaveLength(25);
    expect(result.session.items[result.initialIndex].id).toBe("passage-134");
    expect(result.session.items[0]).toBe(session.items[125]);
    expect(session.items).toHaveLength(531);
  });
  it("moves across both window boundaries with absolute indices and stops only at global ends", () => {
    const first = selectPracticeWindow(session, 0).session;
    const second = selectPracticeWindow(session, 25).session;
    expect(practiceNavigationTarget(first, 25)).toEqual({ absoluteIndex: 25, reload: true });
    expect(practiceNavigationTarget(second, -1)).toEqual({ absoluteIndex: 24, reload: true });
    expect(practiceNavigationTarget(second, 1)).toEqual({ absoluteIndex: 26, reload: false });
    expect(practiceNavigationTarget(first, -1)).toBeNull();
    const last = selectPracticeWindow(session, 530).session;
    expect(last.windowOffset).toBe(525);
    expect(last.items).toHaveLength(6);
    expect(practiceNavigationTarget(last, 6)).toBeNull();
  });
  it("clamps missing, negative and out-of-range requested positions", () => {
    expect(selectPracticeWindow(session, undefined).initialIndex).toBe(0);
    expect(selectPracticeWindow(session, -9).session.windowOffset).toBe(0);
    expect(selectPracticeWindow(session, 99999)).toMatchObject({ initialIndex: 5, session: { windowOffset: 525 } });
  });
  it("leaves whole test sessions unchanged", () => {
    const test = { ...session, testId: "one-test" };
    expect(selectPracticeWindow(test, 134)).toEqual({ session: test, initialIndex: 134 });
    expect(practiceWindowInfo(test)).toEqual({ offset: 0, total: 531 });
    expect(practiceNavigationTarget(test, 25)).toEqual({ absoluteIndex: 25, reload: false });
  });
  it("rejects inconsistent source totals and invalid serialized windows", () => {
    expect(() => selectPracticeWindow({ ...session, total: 500 }, 0)).toThrow("session total");
    expect(() => practiceWindowInfo({ ...session, windowOffset: 25, items: session.items.slice(0, 26) })).toThrow("practice window");
    expect(() => practiceWindowInfo({ ...session, windowOffset: 26, items: session.items.slice(0, 25) })).toThrow("practice window");
  });
});
