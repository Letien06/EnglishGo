import type { WritingPart } from "@/types/writing";

export const WRITING_PARTS: Array<{
  id: WritingPart;
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  gradient: string;
}> = [
  {
    id: 1,
    eyebrow: "Part 1 · Picture",
    title: "Viết câu theo tranh",
    description: "Dùng đủ hai từ khóa, đúng ngữ pháp và sát bối cảnh ảnh.",
    icon: "✦",
    gradient: "from-azure to-celadon",
  },
  {
    id: 2,
    eyebrow: "Part 2 · Email",
    title: "Trả lời email công việc",
    description: "Xử lý đúng yêu cầu, rõ giọng điệu và bố cục chuyên nghiệp.",
    icon: "✉",
    gradient: "from-plum to-azure",
  },
  {
    id: 3,
    eyebrow: "Part 3 · Opinion essay",
    title: "Bài luận nêu quan điểm",
    description: "Lập luận có dẫn chứng, tổ chức ý và dùng tiếng Anh thuyết phục.",
    icon: "▤",
    gradient: "from-terracotta to-primary",
  },
];
