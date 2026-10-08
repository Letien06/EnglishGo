import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GrammarCatalog } from "@/lib/storage/grammar-snapshot";
import GrammarLibraryClient from "./GrammarLibraryClient";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/ReadingSectionNav", () => ({ default: () => <nav aria-label="Phần luyện đọc">Ngữ pháp · Part 5 · Part 6 · Part 7</nav> }));
const catalog: GrammarCatalog = { version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", syncedAt: "2026-10-08T00:00:00.000Z", topics: [
  { id: "nouns", slug: "nouns", title: "Danh từ", bigTopic: "Từ loại", orderIndex: 0, questionCount: 287, subtopics: [{ id: "n1", slug: "position", title: "Vị trí", orderIndex: 0, accessLevel: "free", questionCount: 287 }] },
  { id: "tenses", slug: "tenses", title: "Thì", bigTopic: "Động từ", orderIndex: 1, questionCount: 113, subtopics: [{ id: "t1", slug: "present", title: "Hiện tại", orderIndex: 0, accessLevel: "free", questionCount: 113 }] },
  { id: "relative", slug: "relative", title: "Mệnh đề quan hệ", bigTopic: "Ngữ pháp khác", orderIndex: 2, questionCount: 156, subtopics: [{ id: "r1", slug: "clauses", title: "Mệnh đề", orderIndex: 0, accessLevel: "pro", questionCount: 156 }] },
] };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => localStorage.clear());
const answerKeys = { nouns: { q1: "A", q2: "B" }, tenses: { q3: "C" }, relative: { q4: "D" } };
describe("grouped grammar library", () => {
  it("keeps device progress unknown in server markup before hydration", () => {
    const markup = renderToStaticMarkup(<GrammarLibraryClient catalog={catalog} learnerId="guest" answerKeys={answerKeys} />);
    const node = document.createElement("div"); node.innerHTML = markup;
    expect(node.textContent).toContain("Đã làm —/287");
    expect(node.textContent).toContain("Đúng — · Sai —");
    expect(node.querySelector('[role="progressbar"]')).not.toHaveAttribute("aria-valuenow");
  });
  it("does not turn unavailable local storage into zero progress", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    render(<GrammarLibraryClient catalog={catalog} learnerId="alice" answerKeys={answerKeys} />);
    const nouns = screen.getByRole("heading", { name: "Danh từ" }).closest("article")!;
    expect(within(nouns).getByText("Đã làm —/287")).toBeInTheDocument();
    expect(within(nouns).getByText("Không đọc được tiến độ thiết bị")).toBeInTheDocument();
    expect(within(nouns).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });
  it("shows topic and group counts with reading navigation and real study links", () => {
    render(<GrammarLibraryClient catalog={catalog} learnerId="guest" answerKeys={answerKeys} />);
    expect(screen.getByRole("navigation", { name: "Phần luyện đọc" })).toBeInTheDocument();
    expect(screen.getByText("3 chủ đề · 556 câu hỏi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Từ loại" })).toBeInTheDocument();
    const nouns = screen.getByRole("heading", { name: "Danh từ" }).closest("article")!;
    expect(within(nouns).getByText("287 câu hỏi · 1 chuyên đề")).toBeInTheDocument();
    expect(within(nouns).getByRole("link", { name: /Học ngay/ })).toHaveAttribute("href", "/read/grammar/nouns");
  });
  it("filters groups through accessible pills and restores all topics", () => {
    render(<GrammarLibraryClient catalog={catalog} learnerId="guest" answerKeys={answerKeys} />);
    fireEvent.click(screen.getByRole("button", { name: "Động từ" }));
    expect(screen.getByRole("button", { name: "Động từ" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Thì" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Danh từ" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tất cả" }));
    expect(screen.getAllByRole("link", { name: /Học ngay/ })).toHaveLength(3);
  });
  it("renders an honest unavailable state for a missing optional catalog", () => {
    render(<GrammarLibraryClient catalog={null} learnerId="guest" answerKeys={{}} />);
    expect(screen.getByText("Chưa có bài ngữ pháp. Vui lòng thử lại sau.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Học ngay/ })).not.toBeInTheDocument();
  });
  it("reads only the current learner progress and refreshes cards on return to the page", () => {
    localStorage.setItem("englishweb:grammar:v1:alice:nouns", JSON.stringify({ q1: "A", q2: "D", unknown: "A" }));
    localStorage.setItem("englishweb:grammar:v1:bob:tenses", JSON.stringify({ q3: "C" }));
    render(<GrammarLibraryClient catalog={catalog} learnerId="alice" answerKeys={answerKeys} />);
    const nouns = screen.getByRole("heading", { name: "Danh từ" }).closest("article")!;
    expect(within(nouns).getByText("Đã làm 2/287")).toBeInTheDocument();
    expect(within(nouns).getByText(/Đúng/)).toHaveTextContent("Đúng 1 · Sai 1");
    expect(within(nouns).getByRole("link", { name: /Học tiếp/ })).toBeInTheDocument();
    expect(within(nouns).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    const tenses = screen.getByRole("heading", { name: "Thì" }).closest("article")!;
    expect(within(tenses).getByText("Đã làm 0/113")).toBeInTheDocument();
    localStorage.setItem("englishweb:grammar:v1:alice:tenses", JSON.stringify({ q3: "C" }));
    fireEvent(window, new Event("pageshow"));
    expect(within(tenses).getByText("Đã làm 1/113")).toBeInTheDocument();
  });
});
