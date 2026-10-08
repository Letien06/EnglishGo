import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GrammarPracticeClient from "./GrammarPracticeClient";
import type { GrammarCatalog, GrammarTopic } from "@/lib/storage/grammar-snapshot";
vi.mock("@/components/IntentLink", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/ThemeToggle", () => ({ default: () => <button>Theme</button> }));
const metadata: GrammarCatalog["topics"][number] = { id: "1", slug: "verbs", title: "Động từ", bigTopic: null, orderIndex: 1, questionCount: 1, subtopics: [{ id: "2", slug: "tense", title: "Thì", orderIndex: 1, accessLevel: "pro", questionCount: 1 }] };
const topic: GrammarTopic = { version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized", topicId: "1", questions: [{ id: "20", topicId: "1", subtopicId: "2", text: "She ____ here.", options: { A: "works", B: "work", C: null, D: null }, answer: "A", explanation: "Chủ ngữ số ít.", translation: "Cô ấy làm ở đây.", vocabulary: null, orderIndex: 1 }] };
describe("grammar device progress and feedback", () => {
  beforeEach(() => localStorage.clear());
  it("grades once, displays explanation and translation, and persists only the current learner device key", async () => {
    render(<GrammarPracticeClient topic={topic} metadata={metadata} learnerId="alice" />);
    const option = screen.getByRole("button", { name: "B.work" });
    await waitFor(() => expect(option).toBeEnabled());
    fireEvent.click(option);
    expect(screen.getByText("Đáp án đúng: A")).toBeInTheDocument();
    expect(screen.getByText("Chủ ngữ số ít.")).toBeInTheDocument();
    expect(screen.getByText("Cô ấy làm ở đây.")).toBeInTheDocument();
    expect(option).toBeDisabled();
    expect(JSON.parse(localStorage.getItem("englishweb:grammar:v1:alice:1")!)).toEqual({ "20": "B" });
    expect(localStorage.getItem("englishweb:grammar:v1:bob:1")).toBeNull();
  });
  it("restores valid current-topic answers without importing another learner or unknown question", async () => {
    localStorage.setItem("englishweb:grammar:v1:alice:1", JSON.stringify({ "20": "A", "unknown": "D" }));
    localStorage.setItem("englishweb:grammar:v1:bob:1", JSON.stringify({ "20": "B" }));
    render(<GrammarPracticeClient topic={topic} metadata={metadata} learnerId="alice" />);
    await waitFor(() => expect(screen.getByText("Chính xác!")).toBeInTheDocument());
    expect(screen.getAllByText("Đã làm 1/1 · Đúng 1 · Sai 0").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /B.work/ })).toBeDisabled();
  });
  it("reserves explanation before answering and displays every subtopic with actual progress", async () => {
    const expanded = { ...topic, questions: [...topic.questions, { ...topic.questions[0], id: "21", subtopicId: "3", text: "They ____ here.", answer: "B" as const }] };
    const info = { ...metadata, bigTopic: "Ngữ pháp căn bản", questionCount: 2, subtopics: [...metadata.subtopics, { ...metadata.subtopics[0], id: "3", title: "Hòa hợp", questionCount: 1 }] };
    render(<GrammarPracticeClient topic={expanded} metadata={info} learnerId="alice" />);
    expect(screen.getByRole("complementary", { name: "Giải thích và từ vựng" })).toBeInTheDocument();
    expect(screen.getByText(/Chọn một đáp án để xem giải thích/)).toBeInTheDocument();
    expect(screen.getByText("Ngữ pháp căn bản")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "B.work" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Chuyên đề: Hòa hợp" }));
    expect(screen.getByText("They ____ here.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "B.work" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "B.work" }));
    expect(screen.getByRole("progressbar", { name: "Tiến độ Hòa hợp" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar", { name: "Tiến độ Thì" })).toHaveAttribute("aria-valuenow", "0");
  });
  it("resumes an unanswered question and supports keyboard answers/navigation without modifier shortcuts", async () => {
    const expanded = { ...topic, questions: [...topic.questions, { ...topic.questions[0], id: "21", text: "They ____ here." }] };
    const info = { ...metadata, questionCount: 2, subtopics: [{ ...metadata.subtopics[0], questionCount: 2 }] };
    localStorage.setItem("englishweb:grammar:v1:alice:1", JSON.stringify({ "20": "A" }));
    render(<GrammarPracticeClient topic={expanded} metadata={info} learnerId="alice" />);
    await waitFor(() => expect(screen.getByText("They ____ here.")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(screen.getByRole("button", { name: "B.work" })).toBeEnabled();
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByText("Đáp án đúng: A")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("She ____ here.")).toBeInTheDocument();
    expect(screen.getByText("Chính xác!")).toBeInTheDocument();
  });
  it("keeps bilingual question translation available before answering", async () => {
    render(<GrammarPracticeClient topic={topic} metadata={metadata} learnerId="alice" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "B.work" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Song ngữ" }));
    expect(screen.getByRole("button", { name: "Song ngữ" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Cô ấy làm ở đây.")).toBeInTheDocument();
    expect(screen.getByText(/Chọn một đáp án để xem giải thích/)).toBeInTheDocument();
  });
  it("resumes into the next subtopic when the first subtopic is complete", async () => {
    const expanded = { ...topic, questions: [...topic.questions, { ...topic.questions[0], id: "21", subtopicId: "3", text: "They ____ here." }] };
    const info = { ...metadata, questionCount: 2, subtopics: [...metadata.subtopics, { ...metadata.subtopics[0], id: "3", title: "Hòa hợp", questionCount: 1 }] };
    localStorage.setItem("englishweb:grammar:v1:alice:1", JSON.stringify({ "20": "A" }));
    render(<GrammarPracticeClient topic={expanded} metadata={info} learnerId="alice" />);
    await waitFor(() => expect(screen.getByText("They ____ here.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Chuyên đề: Tất cả" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("Câu 2/2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Tiến độ Thì" })).toHaveAttribute("aria-valuenow", "1");
  });
  it("starts the mobile sidebar collapsed with an accessible toggle", async () => {
    render(<GrammarPracticeClient topic={topic} metadata={metadata} learnerId="alice" />);
    const toggle = screen.getByRole("button", { name: /Chuyên đề Mở danh sách/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "grammar-subtopics");
    expect(document.getElementById("grammar-subtopics")).toHaveClass("hidden", "xl:block");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "B.work" })).toBeEnabled());
  });
  it("shows unknown counts when device progress cannot be read while still allowing practice", async () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable storage"); });
    try {
      render(<GrammarPracticeClient topic={topic} metadata={metadata} learnerId="alice" />);
      await waitFor(() => expect(screen.getByRole("button", { name: "B.work" })).toBeEnabled());
      expect(screen.getByRole("progressbar", { name: "Tiến độ Thì" })).not.toHaveAttribute("aria-valuenow");
      expect(screen.getAllByText("Đã làm —/1 · Đúng — · Sai —").length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "B.work" }));
      expect(screen.getByText("Đáp án đúng: A")).toBeInTheDocument();
      expect(screen.getByRole("progressbar", { name: "Tiến độ Thì" })).not.toHaveAttribute("aria-valuenow");
    } finally { read.mockRestore(); }
  });
});
