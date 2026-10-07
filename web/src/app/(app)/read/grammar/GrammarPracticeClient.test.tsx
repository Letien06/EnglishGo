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
    expect(screen.getByText("Đã làm 1/1 · Đúng 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /B.work/ })).toBeDisabled();
  });
});
