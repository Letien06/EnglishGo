import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicVocabCatalogView, DauToeicVocabTestCard } from "@/types/dautoeic";
import VocabLearnTabClient from "./VocabLearnTabClient";
import { fetchWithTimeout } from "@/lib/client-request";
import VocabLoading from "./loading";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/client-request", () => ({ fetchWithTimeout: vi.fn(() => new Promise(() => {})), recordNextPaint: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.mocked(fetchWithTimeout).mockReset().mockImplementation(() => new Promise(() => {}));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function card(overrides: Partial<DauToeicVocabTestCard> = {}): DauToeicVocabTestCard {
  return { id: "test-1", internalSetId: 42, setId: "group-1", setName: "ETS", title: "Test 1", orderIndex: 1, accessLevel: null, partCount: 2, wordCount: 160, learnedWords: 80, masteredWords: 80, dueWords: 0, ...overrides };
}

function catalog(cards: DauToeicVocabTestCard[]): DauToeicVocabCatalogView {
  return { groups: [{ id: "group-1", name: "ETS", orderIndex: 1, count: cards.length }], cards };
}

describe("vocabulary catalog study entry", () => {
  it("renders every supplied playable group and opens all seven group catalogs without a cap", () => {
    const cards = Array.from({ length: 7 }, (_, index) => card({ id: `test-${index + 1}`, internalSetId: 100 + index, setId: `group-${index + 1}`, setName: `Nhóm ${index + 1}`, title: `Test ${index + 1}` }));
    const groups = cards.map((entry, index) => ({ id: entry.setId, name: entry.setName, orderIndex: index + 1, count: 1 }));
    render(<VocabLearnTabClient initialCatalog={{ groups, cards }} />);
    const navigation = within(screen.getByRole("navigation", { name: "Nhóm từ vựng" }));
    expect(navigation.getAllByRole("button")).toHaveLength(7);
    for (const entry of cards) {
      const group = navigation.getByRole("button", { name: new RegExp(`^${entry.setName}`) });
      fireEvent.click(group);
      expect(group).toHaveAttribute("aria-pressed", "true");
      expect(within(screen.getByRole("article")).getByRole("heading", { name: entry.title })).toBeInTheDocument();
      expect(within(screen.getByRole("article")).getByRole("link", { name: "Học tiếp" })).toHaveAttribute("href", `/vocab/${entry.internalSetId}/flashcards?mode=menu&tab=learn&intent=continue&order=ordered&amount=all`);
    }
    expect(navigation.getAllByRole("button")).toHaveLength(7);
  });

  it("does not hide group tabs when the selected group's search has no matches", () => {
    const cards = Array.from({ length: 7 }, (_, index) => card({ id: `test-${index + 1}`, setId: `group-${index + 1}`, setName: `Nhóm ${index + 1}`, title: `Test ${index + 1}` }));
    render(<VocabLearnTabClient initialCatalog={{ groups: cards.map((entry, index) => ({ id: entry.setId, name: entry.setName, orderIndex: index + 1, count: 1 })), cards }} groupId="group-7" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Tìm bộ từ" }), { target: { value: "Không có bộ này" } });
    expect(within(screen.getByRole("navigation", { name: "Nhóm từ vựng" })).getAllByRole("button")).toHaveLength(7);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("keeps the page heading and catalog shell present while the first catalog loads", () => {
    render(<VocabLoading />);
    expect(screen.getByRole("heading", { name: "Từ vựng." })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Các mục từ vựng" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Đang tải bộ từ vựng" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("0 từ đã thuộc")).not.toBeInTheDocument();
  });

  it("reserves all four action slots and the status row across progress arrival", async () => {
    let resolveCatalog!: (value: Response) => void;
    vi.mocked(fetchWithTimeout).mockImplementationOnce(() => new Promise((resolve) => { resolveCatalog = resolve; }));
    render(<VocabLearnTabClient userUid="user" initialCatalog={catalog([card({ masteredWords: 0, learnedWords: 0 })])} />);
    const article = screen.getByRole("article");
    const footer = article.querySelector("footer")!;
    const statusRow = screen.getByText("Đang tải tiến độ...").parentElement;
    expect(footer.children).toHaveLength(4);
    expect(footer.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    await act(async () => { resolveCatalog(new Response(JSON.stringify({ success: true, data: catalog([card()]) }))); });
    expect(screen.getByRole("article")).toBe(article);
    expect(footer.children).toHaveLength(4);
    expect(within(article).getByRole("link", { name: "Ôn lại" })).toBeInTheDocument();
    expect(statusRow).toBeInTheDocument();
    expect(statusRow).toBeEmptyDOMElement();
  });

  it("continues a half-mastered test without pinning the LC part and offers separate review", () => {
    render(<VocabLearnTabClient initialCatalog={catalog([card()])} />);
    const actions = within(screen.getByRole("article"));
    expect(actions.getByRole("link", { name: "Học tiếp" })).toHaveAttribute("href", "/vocab/42/flashcards?mode=menu&tab=learn&intent=continue&order=ordered&amount=all");
    expect(actions.getByRole("link", { name: "Ôn lại" })).toHaveAttribute("href", "/vocab/42/flashcards?mode=menu&tab=learn&intent=review&order=oldest&amount=all");
    expect(actions.getAllByRole("link")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Tiếp tục học →" })).toHaveAttribute("href", actions.getByRole("link", { name: "Học tiếp" }).getAttribute("href"));
  });

  it("uses review as the single primary study action when all words are mastered", () => {
    render(<VocabLearnTabClient initialCatalog={catalog([card({ masteredWords: 160 })])} />);
    const actions = within(screen.getByRole("article"));
    expect(actions.getByRole("link", { name: "Ôn lại" })).toHaveAttribute("data-action", "learn");
    expect(actions.getByRole("link", { name: "Ôn lại" })).toHaveAttribute("href", "/vocab/42/flashcards?mode=menu&tab=learn&intent=review&order=oldest&amount=all");
    expect(actions.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Ôn lại →" })).toHaveAttribute("href", actions.getByRole("link", { name: "Ôn lại" }).getAttribute("href"));
  });

  it("favors incomplete learning over a completed test with due words", () => {
    render(<VocabLearnTabClient initialCatalog={catalog([card({ masteredWords: 160, dueWords: 10 }), card({ id: "test-2", internalSetId: 43 })])} />);
    expect(screen.getByRole("link", { name: "Tiếp tục học →" })).toHaveAttribute("href", "/vocab/43/flashcards?mode=menu&tab=learn&intent=continue&order=ordered&amount=all");
  });

  it("shows learning while progress is unavailable, even if cached counts look complete", () => {
    render(<VocabLearnTabClient userUid="user" initialCatalog={catalog([card({ masteredWords: 160 })])} />);
    const actions = within(screen.getByRole("article"));
    expect(actions.getByRole("link", { name: "Học" })).toHaveAttribute("href", "/vocab/42/flashcards?mode=menu&tab=learn&intent=continue&order=ordered&amount=all");
    expect(actions.queryByRole("link", { name: "Ôn lại" })).not.toBeInTheDocument();
  });
});
