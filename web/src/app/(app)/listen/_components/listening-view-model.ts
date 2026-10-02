import type { DauToeicPartTest, DauToeicTest } from "@/types/dautoeic";

export const LISTENING_PARTS = [
  { number: 1, name: "Hình ảnh", description: "Quan sát & nhận diện", icon: "image", tip: "Quan sát người, vật và hành động trước khi nghe. Chú ý động từ và vị trí; đừng chọn chỉ vì nghe thấy một từ quen thuộc." },
  { number: 2, name: "Hỏi - đáp", description: "Nghe nhanh, đáp đúng", icon: "reply", tip: "Tập trung vào từ để hỏi ở đầu câu. Câu trả lời đúng có thể là một gợi ý gián tiếp, không nhất thiết lặp lại từ trong câu hỏi." },
  { number: 3, name: "Hội thoại", description: "Hiểu từng tình huống", icon: "conversation", tip: "Đọc trước câu hỏi để xác định thông tin cần nghe. Chú ý vai trò người nói, vấn đề đang gặp và bước tiếp theo." },
  { number: 4, name: "Bài nói ngắn", description: "Bắt ý chính, nắm chi tiết", icon: "broadcast", tip: "Xác định loại bài nói ngay từ câu đầu: thông báo, tin nhắn hay hướng dẫn. Ghi nhớ mục đích và hành động người nghe cần làm." },
] as const;

export type TestStatus = "new" | "learning" | "complete";
export type StudySkill = "listening" | "reading";
export const READING_PARTS = [
  { number: 5, name: "Hoàn thành câu", description: "Vững từ vựng & ngữ pháp", icon: "pen", tip: "Xác định từ loại cần điền trước khi đọc đáp án. Với câu hỏi ngữ pháp, chú ý chủ ngữ, thì và cấu trúc của cả câu." },
  { number: 6, name: "Hoàn thành đoạn", description: "Nối ý, hiểu ngữ cảnh", icon: "document", tip: "Đọc cả câu trước và sau chỗ trống. Đáp án cần đúng ngữ pháp và nối mạch ý của đoạn văn." },
  { number: 7, name: "Đọc hiểu", description: "Đọc có mục tiêu", icon: "book", tip: "Đọc câu hỏi trước, tìm từ khóa rồi đối chiếu thông tin trong bài. Với nhiều văn bản, chú ý mối liên hệ giữa chúng." },
] as const;
export const studyParts = (skill: StudySkill) => skill === "reading" ? READING_PARTS : LISTENING_PARTS;
export type TestFilter = "all" | TestStatus;
export type TestSort = "catalog" | "newest" | "progress-desc" | "progress-asc";
export type PartProgress = { done: number; total: number };
export type ListeningTestMetadata = { year: number | null; difficultyLevel: number | null };
export type ListeningMetadata = Record<string, ListeningTestMetadata>;

export function listeningMetadata(tests: Array<Pick<DauToeicTest, "id" | "year" | "difficultyLevel" | "isHidden">>): ListeningMetadata {
  return Object.fromEntries(tests.filter((test) => !test.isHidden).map((test) => [test.id, {
    year: typeof test.year === "number" && Number.isInteger(test.year) && test.year > 0 ? test.year : null,
    difficultyLevel: typeof test.difficultyLevel === "number" && Number.isInteger(test.difficultyLevel) && test.difficultyLevel > 0 ? test.difficultyLevel : null,
  }]));
}

export function testProgress(test: DauToeicPartTest) {
  const total = Math.max(0, test.questionCount);
  const done = Math.min(total, Math.max(0, test.done));
  const percent = total ? Math.round(done / total * 100) : 0;
  const status: TestStatus = total > 0 && done >= total ? "complete" : done > 0 ? "learning" : "new";
  return { done, total, percent, remaining: total - done, status };
}

export function summarizeTests(tests: DauToeicPartTest[]) {
  const summary = tests.reduce((result, test) => {
    const progress = testProgress(test);
    result.done += progress.done;
    result.total += progress.total;
    result.correct += Math.max(0, test.correct);
    result.wrong += Math.max(0, test.wrong);
    return result;
  }, { done: 0, total: 0, correct: 0, wrong: 0 });
  const graded = summary.correct + summary.wrong;
  return { ...summary, accuracy: graded ? Math.round(summary.correct / graded * 100) : null };
}

export function practiceHref(test: DauToeicPartTest) {
  return `/${test.part >= 5 ? "read" : "listen"}/practice?part=part${test.part}&testId=${encodeURIComponent(test.testId)}&mode=normal&q=${test.nextIndex}`;
}

export function resumePosition(test: DauToeicPartTest) {
  const grouped = [3, 4, 6, 7].includes(test.part);
  const total = grouped ? test.itemCount : test.questionCount;
  const position = Math.min(Math.max(0, test.nextIndex) + 1, total);
  return `${grouped ? "cụm" : "câu"} ${position}/${total}`;
}

export function estimatedMinutes(test: DauToeicPartTest) {
  return Math.max(1, Math.ceil(test.questionCount * (test.part === 1 ? 40 : test.part === 2 ? 25 : test.part === 5 ? 30 : test.part >= 6 ? 60 : 35) / 60));
}

export function filterTests(tests: DauToeicPartTest[], filter: TestFilter, query: string, sort: TestSort, metadata: ListeningMetadata = {}) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
  const search = normalize(query.trim());
  const result = tests.filter((test) => (filter === "all" || testProgress(test).status === filter)
    && normalize(`${test.testName} ${test.setName}`).includes(search));
  if (sort !== "catalog") result.sort((left, right) => {
    if (sort === "newest") return (metadata[right.testId]?.year ?? 0) - (metadata[left.testId]?.year ?? 0);
    const difference = testProgress(left).percent - testProgress(right).percent;
    return sort === "progress-desc" ? -difference : difference;
  });
  return result;
}
