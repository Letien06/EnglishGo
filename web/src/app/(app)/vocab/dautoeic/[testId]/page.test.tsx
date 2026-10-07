import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { getDautoeicVocabTestView } from "@/lib/services/dautoeic-vocab";
import { isDriveContentEnabled } from "@/lib/services/dautoeic-drive";

vi.mock("@/lib/auth/session", () => ({ getCurrentUserForRead: vi.fn() }));
vi.mock("@/lib/services/dautoeic-vocab", () => ({ getDautoeicVocabTestView: vi.fn() }));
vi.mock("@/lib/services/dautoeic-drive", () => ({ isDriveContentEnabled: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock("@/components/AppTopbar", () => ({ default: () => null }));
vi.mock("./DautoeicPartsClient", () => ({ default: () => null }));

beforeEach(() => {
  vi.mocked(getCurrentUserForRead).mockResolvedValue({ uid: "learner" } as Awaited<ReturnType<typeof getCurrentUserForRead>>);
  vi.mocked(isDriveContentEnabled).mockReturnValue(true);
  vi.mocked(getDautoeicVocabTestView).mockResolvedValue({ test: { name: "Test 1" }, setName: "2026", parts: [{ id: "empty", wordCount: 0 }, { id: "lc", wordCount: 80, internalSetId: 123 }] } as Awaited<ReturnType<typeof getDautoeicVocabTestView>>);
});
describe("direct vocabulary activities", () => {
  it.each(["view", "play"])("opens the first non-empty part on the requested %s tab", async (tab) => {
    await expect(Page({ params: Promise.resolve({ testId: "source" }), searchParams: Promise.resolve({ tab }) })).rejects.toThrow(`REDIRECT:/vocab/123/flashcards?mode=menu&tab=${tab}&partId=lc&mastery=all&order=ordered&amount=all`);
  });
  it("delegates learning to progress-based part selection instead of pinning LC", async () => {
    await expect(Page({ params: Promise.resolve({ testId: "source" }), searchParams: Promise.resolve({ tab: "learn" }) })).rejects.toThrow("REDIRECT:/vocab/123/flashcards?mode=menu&tab=learn&intent=continue&order=ordered&amount=all");
  });
  it("preserves activity through the login redirect", async () => {
    vi.mocked(getCurrentUserForRead).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ testId: "source" }), searchParams: Promise.resolve({ tab: "play" }) })).rejects.toThrow(`REDIRECT:/login?redirect=${encodeURIComponent("/vocab/dautoeic/source?tab=play")}`);
  });
  it("keeps the original part picker for legacy links and for storage requiring sync", async () => {
    await expect(Page({ params: Promise.resolve({ testId: "source" }), searchParams: Promise.resolve({}) })).resolves.toBeTruthy();
    vi.mocked(isDriveContentEnabled).mockReturnValue(false);
    await expect(Page({ params: Promise.resolve({ testId: "source" }), searchParams: Promise.resolve({ tab: "play" }) })).resolves.toBeTruthy();
  });
});
