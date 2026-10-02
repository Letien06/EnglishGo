import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicVocabCatalogView, DauToeicVocabPartSummary } from "@/types/dautoeic";
import VocabLearnTabClient from "./VocabLearnTabClient";
import DautoeicPartsClient from "./dautoeic/[testId]/DautoeicPartsClient";
import FlashcardGame from "./[setId]/flashcards/FlashcardGame";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const catalog: DauToeicVocabCatalogView = {
  groups: [{ id: "2026", name: "2026", orderIndex: 1, count: 1 }],
  cards: [{ id: "source-test", internalSetId: 123, setId: "2026", setName: "2026", title: "Test 1", orderIndex: 1,
    accessLevel: "free", partCount: 2, wordCount: 160, learnedWords: 0, masteredWords: 0, dueWords: 0 }],
};
const parts: DauToeicVocabPartSummary[] = ["LC", "RC"].map((name, orderIndex) => ({
  id: name.toLowerCase(), name, orderIndex, wordCount: 80, internalSetId: 123, learnedWords: 0, masteredWords: 0, dueWords: 0,
}));

beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined))); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("vocabulary loading", () => {
  it("filters mastery, searches and sorts locally without extra requests", () => {
    const progressed = { ...catalog, cards: [
      { ...catalog.cards[0], id: "new", title: "Test A" },
      { ...catalog.cards[0], id: "learning", title: "Test B", learnedWords: 160, masteredWords: 40, dueWords: 4 },
      { ...catalog.cards[0], id: "complete", title: "Test C", learnedWords: 160, masteredWords: 160 },
    ] };
    render(<VocabLearnTabClient initialCatalog={progressed} />);
    fireEvent.click(screen.getByRole("button", { name: "Đã thuộc" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Test C" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cần ôn" }));
    expect(screen.getByRole("link", { name: "Vào học" })).toHaveAttribute("href", "/vocab/dautoeic/learning");
    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "progress" } });
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Test C");
    fireEvent.change(screen.getByRole("textbox", { name: "Tìm bộ từ" }), { target: { value: "not found" } });
    expect(screen.getByText("Chưa tìm thấy bộ từ phù hợp")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("renders all workspace tabs while supplemental history and set options are pending", () => {
    render(<FlashcardGame session={{ set: { id: 123, title: "Test 1 - LC", topic: "2026", externalPartId: "lc" }, words: [{ id: 1, word: "office", meaning: "van phong", mastered: false }] }} initialMode="menu" practiceOptions={[]} reviewMode={false} isAuthenticated loginHref="/login" loadExtrasInBackground />);
    expect(screen.getByRole("heading", { name: "Test 1 - LC" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Xem từ" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Lật thẻ xem đáp án" })).toHaveTextContent("office");
    fireEvent.click(screen.getByRole("tab", { name: "Học" }));
    expect(screen.getByText("Flashcard", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Chơi" }));
    expect(screen.getByText("Word Blast", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Mưa từ vựng", { exact: true })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/vocab/history?setId=123&externalPartId=lc", expect.anything());
    expect(fetch).toHaveBeenCalledWith("/api/vocab/sets?scope=practice", expect.anything());
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("renders the bundled catalog immediately while progress is still pending", () => {
    render(<VocabLearnTabClient initialCatalog={catalog} userUid="learner" />);
    expect(screen.getByRole("heading", { name: "Test 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vào học" })).toHaveAttribute("href", "/vocab/dautoeic/source-test");
    expect(screen.getByText("Đang tải tiến độ...")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalledWith("/api/vocab/sets", expect.anything());
  });

  it("does not fetch learner data or fallback sets for an anonymous bundled catalog", () => {
    render(<VocabLearnTabClient initialCatalog={catalog} />);
    expect(screen.getByText("160 từ vựng")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("makes both Parts available as direct links without waiting for progress or a sync POST", () => {
    render(<DautoeicPartsClient testId="source-test" parts={parts} ready />);
    const links = screen.getAllByRole("link", { name: "Vào học" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/vocab/123/flashcards?mode=menu&partId=lc&mastery=all&order=random&amount=all");
    expect(links[1]).toHaveAttribute("href", expect.stringContaining("partId=rc"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).not.toBe("POST");
  });

  it("keeps the Parts usable if progress fails instead of reporting zero mastered words", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Quota unavailable"));
    render(<DautoeicPartsClient testId="source-test" parts={parts} ready />);
    expect(await screen.findAllByText("Chưa tải được tiến độ. Bạn vẫn có thể vào học.")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Vào học" })).toHaveLength(2);
    expect(screen.queryByText("0/80 từ đã thuộc")).not.toBeInTheDocument();
  });

  it("does not delay a successful catalog behind a fallback request or retain another learner's progress", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { ...catalog, cards: [{ ...catalog.cards[0], masteredWords: 40 }] } })));
    const first = render(<VocabLearnTabClient userUid="first" />);
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Từ đã thuộc: Test 1" })).toHaveAttribute("aria-valuenow", "25"));
    expect(fetch).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<VocabLearnTabClient initialCatalog={catalog} userUid="second" />);
    expect(screen.getByRole("progressbar", { name: "Từ đã thuộc: Test 1" })).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Đang tải tiến độ...")).toBeInTheDocument();
  });
});
