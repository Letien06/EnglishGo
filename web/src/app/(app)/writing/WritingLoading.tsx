import Link from "next/link";
import { LearningHero, LearningTip } from "../_components/LearningDashboardUI";
import Icon from "../listen/_components/ListeningIcon";
import { WRITING_PARTS } from "./WritingLibraryParts";
import { WRITING_PART_ONE_GRAMMAR_CATEGORIES, WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS } from "@/types/writing";
import styles from "../listen/_components/listening.module.css";

export function WritingGridSkeleton({ part = 1 }: { part?: number }) {
  return <div className={styles.grid} role="status" aria-label="Đang tải đề viết" aria-busy="true">
    {Array.from({ length: 6 }, (_, index) => <div className={styles.card} key={index} aria-hidden="true">
      {part === 1 && <div className={styles.cardImage} />}
      <div className={styles.cardTop}><span className={styles.cardLabel}>LUYỆN VIẾT · PART {part}</span><div className={styles.skeletonBadge} /></div>
      <div className={styles.cardHeading}><div className="flex-1 space-y-2"><div className={`${styles.skeletonLine} min-h-6`} /><div className={styles.skeletonLine} /><div className={styles.skeletonLine} /></div><div className={styles.skeletonCircle} /></div>
      <div className={`${styles.skeletonLine} mb-3 min-h-10`} />
      <div className={styles.answerStats}><span className="h-5 w-16" /><span className="h-5 w-16" /></div>
      <div className={styles.metadata}><div className={styles.skeletonLine} /></div>
      <footer className={styles.cardFooter}><div className={styles.skeletonButton} /></footer>
    </div>)}
  </div>;
}

export default function WritingLoading() {
  return <main className={styles.dashboard} aria-busy="true" aria-label="Đang tải thư viện luyện viết">
    <span className={styles.eyebrow}>KHÔNG GIAN LUYỆN TẬP</span>
    <header className={styles.intro}><div><h1>Luyện viết<span>.</span></h1><p>Từng ý tưởng nhỏ. Từng câu viết tốt hơn.</p></div><Link className={styles.dictationLink} href="/writing/history"><Icon name="clock" />Lịch sử bài viết<Icon name="arrow" /></Link></header>
    <LearningHero icon="pen" title="Biến ý tưởng thành câu chữ." description="Chọn một dạng bài. Viết, nhận phản hồi và thử lại." cta="Bắt đầu luyện viết" note="Một bài viết, một bước tiến" stats={[
      { label: "Đề luyện viết", value: "—", unit: "đề", detail: "Trong Part 1 đang chọn", icon: "document" },
      { label: "Đề đã chấm", value: "—", detail: "Trong 30 lượt gần nhất của Part", icon: "check" },
      { label: "Điểm AI TB", value: "—", unit: "%", detail: "Điểm mới nhất mỗi đề / điểm tối đa", icon: "target" },
    ]} />
    <div className={styles.sectionLabel}><span className={styles.eyebrow}>01 / CHỌN DẠNG BÀI</span><span>Viết đúng trước, viết hay sau</span></div>
    <nav className={styles.parts} data-columns="3" aria-label="Chọn dạng bài viết">{WRITING_PARTS.map((part) => <button key={part.id} type="button" className={styles.part} disabled aria-pressed={part.id === 1}><span className={styles.partIcon}><Icon name={part.id === 1 ? "image" : part.id === 2 ? "reply" : "pen"} /></span><span className={styles.partText}><span>PART {part.id}</span><strong>{part.title}</strong><small>{part.description}</small></span></button>)}</nav>
    <section className={styles.library} aria-label="Thư viện đề viết">
      <div className={styles.libraryHeading}><div><span className={styles.eyebrow}>02 / BÀI LUYỆN CỦA BẠN</span><h2>Viết câu theo tranh</h2></div><p className={styles.catalogTotal}><strong>—</strong> đề viết</p></div>
      <div className={styles.toolbar}><div className={styles.filters} aria-label="Lọc bài đã chấm"><button type="button" disabled aria-pressed>Tất cả</button><button type="button" disabled>Đã chấm gần đây<span>—</span></button></div><div className={styles.tools}><label className={styles.search}><Icon name="search" /><input aria-label="Tìm đề viết" placeholder="Tìm chủ đề, từ khóa..." disabled /></label><label className={styles.sort}><span>Sắp xếp</span><select aria-label="Sắp xếp đề viết" disabled><option>Theo thư viện</option></select></label></div></div>
      <div className="mt-4"><p className={styles.cardDescription}>Luyện theo cặp từ · Chọn cấu trúc bạn muốn cải thiện.</p><div className={styles.filters} aria-label="Lọc câu theo dạng từ">{["all", ...WRITING_PART_ONE_GRAMMAR_CATEGORIES].map((category) => <button key={category} type="button" disabled className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-extrabold"><span>{category === "all" ? "Tất cả" : WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS[category as keyof typeof WRITING_PART_ONE_GRAMMAR_CATEGORY_LABELS]}</span><span className="rounded-md px-1.5 py-0.5 text-[10px]">0 câu</span></button>)}</div></div>
      <p className={styles.resultCount} aria-live="polite">Đang tải đề viết...</p>
      <WritingGridSkeleton />
      <p className={styles.caption}>Điểm AI là ước tính học tập, không phải điểm ETS chính thức. Thống kê chỉ gồm đề trong thư viện xuất hiện ở 30 lượt nộp gần nhất của Part; không phải toàn bộ lịch sử.</p>
    </section>
    <LearningTip title="Mẹo luyện viết">Viết bản đầu tiên bằng ý của bạn, rồi đối chiếu phản hồi AI. Mỗi lần viết lại, tập trung sửa một điểm: ngữ pháp, từ vựng hoặc cách tổ chức ý.</LearningTip>
    <p className={styles.caption}>Đề, ảnh, từ khóa và câu mẫu trong thư viện là nội dung tự biên soạn. Dùng phản hồi AI như gợi ý, không phải chứng nhận điểm thi.</p>
  </main>;
}
