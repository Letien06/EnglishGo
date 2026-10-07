import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicDifficultySession, DauToeicPracticeItem } from "@/types/dautoeic";
import type { PracticeWindowSession } from "./practice-window";

const mocks = vi.hoisted(() => ({ difficulty: vi.fn(), test: vi.fn() }));
vi.mock("@/lib/services/dautoeic", () => ({ getReadingDifficultySession: mocks.difficulty, getDifficultySession: mocks.difficulty }));
vi.mock("@/lib/services/test-part-practice", () => ({ getTestPartSession: mocks.test }));
vi.mock("@/lib/auth/session", () => ({ getReadIdentity: async () => ({ uid: "learner" }) }));
vi.mock("@/app/(app)/read/practice/ReadPracticeClient", () => ({ default: () => null }));
vi.mock("@/app/(app)/listen/practice/ListenPracticeClient", () => ({ default: () => null }));
import ReadPage from "@/app/(app)/read/practice/page";
import ListenPage from "@/app/(app)/listen/practice/page";

const full: DauToeicDifficultySession = { part: 7, level: 3, title: "Practice", total: 531, items: Array.from({ length: 531 }, (_, index) => ({ id: `item-${index}`, questions: [] } as unknown as DauToeicPracticeItem)) };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); mocks.difficulty.mockResolvedValue(full); mocks.test.mockResolvedValue({ ...full, testId: "test" }); });
afterEach(() => vi.unstubAllGlobals());

describe.each([["reading", ReadPage, "part7"], ["listening", ListenPage, "part3"]] as const)("%s practice server payload", (_skill, page, part) => {
  it("serializes only the window containing absolute q and keys the client by its offset", async () => {
    const element = await page({ searchParams: Promise.resolve({ part, level: "3", q: "134", auto: "1" }) });
    const props = element.props as { session: PracticeWindowSession; initialIndex: number; initialAuto: boolean };
    expect(props.session.items).toHaveLength(25);
    expect(props.session.windowOffset).toBe(125);
    expect(props.session.total).toBe(531);
    expect(props.initialIndex).toBe(9);
    expect(props.initialAuto).toBe(true);
    expect(props.session.items[9].id).toBe("item-134");
    expect(element.key).toContain(":125:");
  });
  it("preserves complete test sessions", async () => {
    const element = await page({ searchParams: Promise.resolve({ part, testId: "test", q: "134" }) });
    const props = element.props as { session: PracticeWindowSession; initialIndex: number };
    expect(props.session.items).toHaveLength(531);
    expect(props.session.windowOffset).toBeUndefined();
    expect(props.initialIndex).toBe(134);
    expect(mocks.difficulty).not.toHaveBeenCalled();
  });
});
