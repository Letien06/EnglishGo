import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicDifficultySession, DauToeicPracticeItem, DauToeicQuestion } from "@/types/dautoeic";
import { parseDelimitedWords } from "@/lib/parsers/vocab-import";
import ReadPracticeClient from "../read/practice/ReadPracticeClient";
import ListenPracticeClient from "../listen/practice/ListenPracticeClient";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/use-practice-resume", () => ({ usePracticeResume: () => ({ markInteraction: vi.fn(), resumeStatus: "" }) }));
vi.mock("@/lib/client-learning-progress-cache", () => ({ invalidateLearningLevels: vi.fn(), setActiveLearnerId: vi.fn() }));

const entries = [
  { word: "applicant", meaning_vi: "người nộp đơn", pos: "n", cefr: "B1", example_en: "The applicant sent her résumé.", example_vi: "Người nộp đơn đã gửi hồ sơ.", collocations: ["qualified applicant", "successful applicant"] },
  { word: "deadline", meaning_vi: "hạn chót", pos: "n", cefr: "B2", example_en: "Please meet the deadline.", example_vi: "Vui lòng hoàn thành trước hạn chót.", collocations: ["meet a deadline"] },
];
const envelope = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) }) as Response;
const vocabularySection = () => screen.getByRole("region", { name: "Từ vựng nên học" });

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/vocab/my-sets") return envelope([{ id: 42, title: "My test words" }]);
    if (url === "/api/vocab/my-sets/42") return envelope({ count: 1 });
    if (url === "/api/reading/progress" || url === "/api/listening/progress") return envelope({ saved: true, authenticated: true });
    throw new Error(`Unexpected mocked API request: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(skill: "reading" | "listening", vocabulary: string) {
  const part = skill === "reading" ? 5 : 1;
  const question = { id: "q1", part, questionText: "Choose the correct answer.", optionA: "Correct", optionB: "Wrong", correctAnswer: "A", vocabulary } as DauToeicQuestion;
  const item = { id: "item", part, level: 1, questions: [question] } as DauToeicPracticeItem;
  const session: DauToeicDifficultySession = { part, level: 1, title: "Practice", total: 1, items: [item] };
  const common = { session, partId: `part${part}`, partNum: part, level: 1, mode: "normal", initialIndex: 0, userLoggedIn: true, userUid: "mock-learner" };
  render(skill === "reading" ? <ReadPracticeClient {...common} /> : <ListenPracticeClient {...common} assist={0} />);
  fireEvent.click(screen.getByLabelText("Đáp án A"));
}

describe.each(["reading", "listening"] as const)("%s practice vocabulary", (skill) => {
  it("renders structured vocabulary as separate clean words and readable details", async () => {
    mount(skill, JSON.stringify(entries));
    const section = vocabularySection();
    await within(section).findByRole("combobox", { name: "Chọn bộ từ của tôi" });
    expect(within(section).getAllByRole("checkbox")).toHaveLength(2);
    const applicant = within(section).getByRole("checkbox", { name: /applicant/ }).closest("label")!;
    const deadline = within(section).getByRole("checkbox", { name: /deadline/ }).closest("label")!;
    expect(applicant).toHaveTextContent("applicant");
    expect(applicant).toHaveTextContent("người nộp đơn");
    expect(applicant).toHaveTextContent("(n)");
    expect(applicant).toHaveTextContent("B1");
    expect(deadline).toHaveTextContent("hạn chót");
    expect(deadline).toHaveTextContent("B2");
    expect(section.textContent).not.toMatch(/[{}]/);
    expect(within(section).queryByText(/The applicant sent her résumé/)).not.toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", { name: "Xem chi tiết" }));
    expect(applicant).toHaveTextContent("The applicant sent her résumé.");
    expect(applicant).toHaveTextContent("Người nộp đơn đã gửi hồ sơ.");
    expect(applicant).toHaveTextContent("qualified applicant");
    expect(applicant).toHaveTextContent("successful applicant");
    expect(deadline).toHaveTextContent("meet a deadline");
    expect(section.textContent).not.toMatch(/[{}]|"(?:word|meaning_vi|example_en|collocations)"/);
  });

  it("sends only selected clean word and meaning in the mocked add request", async () => {
    const meaning = "người nộp đơn; ứng viên, người xin việc | nhân sự";
    mount(skill, JSON.stringify([{ ...entries[0], meaning_vi: meaning }, entries[1]]));
    const section = vocabularySection();
    await within(section).findByRole("combobox", { name: "Chọn bộ từ của tôi" });
    fireEvent.click(within(section).getByRole("checkbox", { name: /applicant/ }));
    fireEvent.click(within(section).getByRole("button", { name: "Thêm vào bộ từ của tôi" }));
    await waitFor(() => {
      const request = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === "/api/vocab/my-sets/42");
      expect(request).toBeDefined();
      expect(JSON.parse(request![1]!.body as string)).toEqual({ action: "manual", rowsText: `word\tmeaning\napplicant\t${meaning}` });
    });
    const request = vi.mocked(fetch).mock.calls.find(([url]) => String(url) === "/api/vocab/my-sets/42")!;
    const payload = JSON.parse(request[1]!.body as string) as { rowsText: string };
    expect(parseDelimitedWords(payload.rowsText).map(({ word, meaning: parsedMeaning }) => ({ word, meaning: parsedMeaning }))).toEqual([{ word: "applicant", meaning }]);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === `/api/${skill}/progress`)).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === "/api/vocab/my-sets/42")).toHaveLength(1);
  });

  it("keeps legacy vocabulary text readable and selectable", async () => {
    mount(skill, "applicant (n) B1 người nộp đơn\ndeadline (n) B2 hạn chót");
    const section = vocabularySection();
    await within(section).findByRole("combobox", { name: "Chọn bộ từ của tôi" });
    expect(within(section).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(section).getByRole("checkbox", { name: /applicant/ }).closest("label")).toHaveTextContent("người nộp đơn");
    expect(within(section).getByRole("checkbox", { name: /deadline/ }).closest("label")).toHaveTextContent("hạn chót");
    expect(section.textContent).not.toMatch(/[{}]/);
  });

  it.each(["[]", "{invalid JSON"])("handles empty or malformed structured vocabulary (%s) without controls or set requests", (vocabulary) => {
    mount(skill, vocabulary);
    const section = vocabularySection();
    expect(within(section).getByText("Chưa có từ vựng hợp lệ cho câu này.")).toBeInTheDocument();
    expect(within(section).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(section).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(section).queryByRole("button")).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith("/api/vocab/my-sets"))).toBe(false);
    expect(section.textContent).not.toContain(vocabulary);
  });
});
