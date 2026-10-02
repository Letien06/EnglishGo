import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import VocabularySidebar from "./VocabularySidebar";

afterEach(() => vi.unstubAllGlobals());
describe("part sidebar", () => {
  it("preserves activity and part selection without changing progress", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { parts: [
      { id: "lc", name: "LC", wordCount: 80, internalSetId: 123 },
      { id: "rc", name: "RC", wordCount: 80, internalSetId: 123 },
    ] } })));
    vi.stubGlobal("fetch", fetcher);
    const navigate = vi.fn();
    render(<VocabularySidebar testId="test" partId="lc" title="Test 1" count={80} tab="play" ready onNavigate={navigate} />);
    expect(await screen.findByRole("button", { name: "LC · 80 từ" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "RC · 80 từ" }));
    expect(navigate).toHaveBeenCalledWith("/vocab/123/flashcards?mode=menu&tab=play&partId=rc&mastery=all&order=ordered&amount=all");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("leaves the workspace usable if part metadata fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<VocabularySidebar testId="test" title="Test" count={80} tab="view" onNavigate={vi.fn()} />);
    expect(await screen.findByText(/Chưa tải được các phần/)).toBeInTheDocument();
  });
  it("keeps the original sync flow when content is not ready in Drive", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { parts: [{ id: "rc", name: "RC", wordCount: 80, internalSetId: 123 }] } }))));
    const navigate = vi.fn();
    render(<VocabularySidebar testId="test" partId="lc" title="Test" count={80} tab="learn" onNavigate={navigate} />);
    fireEvent.click(await screen.findByRole("button", { name: "RC · 80 từ" }));
    expect(navigate).toHaveBeenCalledWith("/vocab/dautoeic/test?tab=learn");
  });
});
