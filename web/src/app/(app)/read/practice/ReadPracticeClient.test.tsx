import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DauToeicDifficultySession, DauToeicPracticeItem, DauToeicQuestion } from "@/types/dautoeic";
import ReadPracticeClient from "./ReadPracticeClient";

vi.mock("@/components/IntentLink", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("@/lib/use-practice-resume", () => ({ usePracticeResume: () => ({ markInteraction: vi.fn(), resumeStatus: "" }) }));
vi.mock("@/lib/client-learning-progress-cache", () => ({ invalidateLearningLevels: vi.fn(), setActiveLearnerId: vi.fn() }));

function question(id: string, overrides: Partial<DauToeicQuestion> = {}): DauToeicQuestion {
  return {
    id, testId: null, passageId: null, part: 5, section: null, questionNumber: 1,
    audioUrl: null, imageUrl: null, passageText: null, questionText: `Question ${id}`,
    optionA: "satisfy", optionB: "satisfied", optionC: "satisfying", optionD: "satisfaction", correctAnswer: "B",
    explanationVi: null, explanationEn: null, difficultyLevel: 1, orderIndex: 1,
    translationVi: null, vocabulary: null, answerTranslationVi: null, ...overrides,
  };
}
function item(id: string, questions: DauToeicQuestion[], overrides: Partial<DauToeicPracticeItem> = {}): DauToeicPracticeItem {
  return {
    id, itemType: null, part: 5, level: 1, errorRate: null, totalAttempts: null, wrongCount: null,
    audioUrl: null, imageUrl: null, transcript: null, translation: null, vocabulary: null, questions, ...overrides,
  };
}
function mount(items: DauToeicPracticeItem[], mode = "bilingual", part = 5) {
  const session: DauToeicDifficultySession = { part, level: 1, title: "Practice", total: items.length, items };
  return render(<ReadPracticeClient session={session} partId={`part${part}`} partNum={part} level={1} mode={mode} userLoggedIn={false} userUid={null} initialIndex={0} />);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { saved: false, authenticated: false } }) }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState(null, "", "/read/practice?part=part5&level=1");
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("shows the paired Vietnamese Part 5 sentence before answering and retains the answer across modes", () => {
  const translation = "Nhân viên rất hài lòng với lịch làm việc mới.";
  mount([item("one", [question("q1", { questionText: "The staff are ------- with the new schedule.", translationVi: translation })])]);
  const region = screen.getByRole("region", { name: "Bản dịch câu hỏi" });
  expect(region).toHaveTextContent(translation);
  expect(within(region).getByText(translation)).toHaveAttribute("lang", "vi");
  expect(region.compareDocumentPosition(screen.getByLabelText("Đáp án A")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText("Kết quả")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Bình thường" }));
  expect(screen.queryByText(translation)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Song ngữ" }));
  expect(screen.getByRole("region", { name: "Bản dịch câu hỏi" })).toHaveTextContent(translation);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Đáp án B"));
  expect(screen.getByLabelText("Đáp án B")).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Bình thường" }));
  fireEvent.click(screen.getByRole("button", { name: "Song ngữ" }));
  expect(screen.getByLabelText("Đáp án B")).toBeChecked();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("keeps normal mode untranslated until the legacy answer feedback is shown", () => {
  const translation = "Công ty sẽ mở một chi nhánh mới.";
  mount([item("one", [question("q1", { translationVi: translation })])], "normal");
  expect(screen.queryByText(translation)).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Bản dịch câu hỏi" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Đáp án A"));
  expect(screen.getByText(translation)).toBeInTheDocument();
  expect(screen.getByText("Dịch nghĩa câu hỏi")).toBeInTheDocument();
});

it("changes the sentence and its translation together when advancing without saving an answer", () => {
  mount([
    item("one", [question("q1", { questionText: "First English sentence.", translationVi: "Bản dịch câu thứ nhất." })]),
    item("two", [question("q2", { questionText: "Second English sentence.", translationVi: "Bản dịch câu thứ hai." })]),
  ]);
  expect(screen.getByText("First English sentence.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Bản dịch câu hỏi" })).toHaveTextContent("Bản dịch câu thứ nhất.");
  fireEvent.click(screen.getByRole("button", { name: "Bài tiếp" }));
  expect(screen.getByText("Second English sentence.")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Bản dịch câu hỏi" })).toHaveTextContent("Bản dịch câu thứ hai.");
  expect(screen.queryByText("First English sentence.")).not.toBeInTheDocument();
  expect(screen.queryByText("Bản dịch câu thứ nhất.")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("shows a missing-translation message only in bilingual mode", () => {
  mount([item("one", [question("q1")])]);
  expect(screen.getByText("Câu này chưa có bản dịch tiếng Việt.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Bình thường" }));
  expect(screen.queryByText("Câu này chưa có bản dịch tiếng Việt.")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("uses an item translation only when Part 5 contains one question", () => {
  const view = mount([item("one", [question("q1")], { translation: "Bản dịch riêng của câu." })]);
  expect(screen.getByRole("region", { name: "Bản dịch câu hỏi" })).toHaveTextContent("Bản dịch riêng của câu.");
  view.unmount();
  mount([item("group", [question("q2"), question("q3")], { translation: "Bản dịch cả nhóm không dành cho một câu." })]);
  expect(screen.queryByText("Bản dịch cả nhóm không dành cho một câu.")).not.toBeInTheDocument();
  expect(screen.getAllByText("Câu này chưa có bản dịch tiếng Việt.")).toHaveLength(2);
});

it("pairs a reordered unlabelled glossary with the matching option words", () => {
  const glossary = "satisfaction (n): sự hài lòng\n\nsatisfying (adj): làm hài lòng\n\nsatisfy (v): đáp ứng\n\nsatisfied (adj): hài lòng";
  mount([item("one", [question("q1", { translationVi: "Câu hỏi tiếng Việt.", answerTranslationVi: glossary })])]);
  const option = (key: string) => screen.getByLabelText(`Đáp án ${key}`).closest('[data-answer-state]') as HTMLElement;
  expect(within(option("A")).getByText("đáp ứng")).toBeInTheDocument();
  expect(within(option("B")).getByText("hài lòng")).toBeInTheDocument();
  expect(within(option("C")).getByText("làm hài lòng")).toBeInTheDocument();
  expect(within(option("D")).getByText("sự hài lòng")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves an unmatched source glossary after answering without inventing option translations", () => {
  const glossary = "Ghi chú của nguồn: Những dạng từ này thay đổi theo ngữ cảnh.";
  mount([item("one", [question("q1", { translationVi: "Câu hỏi tiếng Việt.", answerTranslationVi: glossary })])]);
  for (const key of ["A", "B", "C", "D"]) {
    const option = screen.getByLabelText(`Đáp án ${key}`).closest('[data-answer-state]')!;
    expect(option.querySelector('[lang="vi"]')).toBeNull();
  }
  expect(screen.queryByText(glossary)).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Đáp án B"));
  const sourceBlock = screen.getByText("Dịch nghĩa đáp án").closest("section")!;
  expect(within(sourceBlock).getByText(glossary)).toBeInTheDocument();
  for (const key of ["A", "B", "C", "D"]) {
    expect(screen.getByLabelText(`Đáp án ${key}`).closest('[data-answer-state]')!.querySelector('[lang="vi"]')).toBeNull();
  }
});

it("renders bilingual sentence markup and entities safely and marks the Vietnamese paragraph language", () => {
  const { container } = mount([item("one", [question("q1", {
    questionText: "<p>The caf&eacute; is -------.</p><p>&lt;contact@example.test&gt;</p>",
    translationVi: "<p>Quán cà phê &amp; phòng họp.</p><p>&lt;img src=x onerror=alert(1)&gt;</p>",
  })])]);
  expect(screen.getByRole("heading", { name: /The café is -------/ })).toHaveTextContent("<contact@example.test>");
  const translation = screen.getByRole("region", { name: "Bản dịch câu hỏi" });
  expect(translation.querySelector('p[lang="vi"]')).toHaveTextContent("Quán cà phê & phòng họp.");
  expect(translation.querySelector('p[lang="vi"]')).toHaveTextContent("<img src=x onerror=alert(1)>");
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("script")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([6, 7])("shows the whole Part %i passage translation once before and after answering", (part) => {
  const translation = "Thông báo: Văn phòng đóng cửa vào thứ Hai để bảo trì.";
  mount([item("passage", [question("q1", { translationVi: translation }), question("q2", { translationVi: translation })], { part, transcript: "NOTICE: The office will close on Monday for maintenance.", translation })], "bilingual", part);
  expect(screen.getByRole("region", { name: "Bản dịch đoạn đọc" })).toHaveTextContent(translation);
  expect(screen.getAllByText(translation)).toHaveLength(1);
  expect(screen.queryByRole("region", { name: "Bản dịch câu hỏi" })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByLabelText("Đáp án A")[0]);
  fireEvent.click(screen.getAllByLabelText("Đáp án B")[1]);
  expect(screen.getAllByText(translation)).toHaveLength(1);
  expect(screen.getAllByRole("region", { name: "Bản dịch đoạn đọc" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Bình thường" }));
  expect(screen.getAllByText(translation)).toHaveLength(1);
  expect(screen.getAllByRole("region", { name: "Bản dịch đoạn đọc" })).toHaveLength(1);
  expect(screen.queryByText("Dịch nghĩa câu hỏi")).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});
