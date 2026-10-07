import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), entry: vi.fn(), filtered: vi.fn(), part: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserForRead: mocks.user }));
vi.mock("@/lib/services/vocab", () => ({ getStudyEntrySession: mocks.entry, getFilteredSession: mocks.filtered, getFilteredSessionForPart: mocks.part, getSession: vi.fn() }));
vi.mock("@/lib/services/dautoeic-drive", () => ({ isDriveContentEnabled: () => true }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock("./FlashcardGame", () => ({ default: () => null }));
import Page from "./page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ uid: "learner" });
  mocks.entry.mockResolvedValue({ set: { id: 123, externalPartId: "rc" }, words: [] });
});
describe("study entry routes", () => {
  it("lets the session choose RC and carries continue intent to the learning component", async () => {
    const page = await Page({ params: Promise.resolve({ setId: "123" }), searchParams: Promise.resolve({ tab: "learn", mode: "menu", intent: "continue" }) });
    expect(mocks.entry).toHaveBeenCalledWith(123, "learner", "continue", undefined);
    expect(page.props.session.set.externalPartId).toBe("rc");
    expect(page.props.studyIntent).toBe("continue");
    expect(mocks.part).not.toHaveBeenCalled();
  });
  it("loads mastered review selection without a part restriction", async () => {
    const page = await Page({ params: Promise.resolve({ setId: "123" }), searchParams: Promise.resolve({ tab: "learn", mode: "menu", intent: "review" }) });
    expect(mocks.entry).toHaveBeenCalledWith(123, "learner", "review", undefined);
    expect(page.props.studyIntent).toBe("review");
    expect(page.props.selectedOrder).toBe("oldest");
  });
  it("requires sign-in for review while preserving its destination", async () => {
    mocks.user.mockResolvedValue(null);
    const destination = "/vocab/123/flashcards?mode=menu&tab=learn&intent=review";
    await expect(Page({ params: Promise.resolve({ setId: "123" }), searchParams: Promise.resolve({ intent: "review" }) })).rejects.toThrow(`REDIRECT:/login?redirect=${encodeURIComponent(destination)}`);
    expect(mocks.entry).not.toHaveBeenCalled();
  });
});
