import Link from "next/link";
import NavIcon from "@/components/NavIcon";
import PublicHeader from "@/components/PublicHeader";

const lessonPaths = [
  {
    href: "/read/grammar",
    badge: "NGỮ PHÁP",
    title: "Chuyên đề Ngữ pháp TOEIC",
    description: "23 chủ đề ngữ pháp trọng tâm với giải thích từng bước, dịch nghĩa song ngữ và đồng bộ tiến độ đám mây.",
  },
  {
    href: "/listen",
    badge: "LISTENING PART 1–4",
    title: "Luyện nghe 4 chế độ",
    description: "Luyện nghe theo cấp độ hoặc theo đề với chế độ Thường, Chọn từ, Điền từ và Dịch nghĩa song ngữ.",
  },
  {
    href: "/read",
    badge: "READING PART 5–7",
    title: "Đọc hiểu song ngữ Anh – Việt",
    description: "Luyện đọc hiểu Part 5, 6, 7 kèm tra từ điển tức thì, ghi chú trực tiếp trên văn bản và lưu từ vựng 1 chạm.",
  },
  {
    href: "/vocab",
    badge: "SPACED REPETITION",
    title: "Từ vựng & Flashcard SM-2",
    description: "Học từ vựng TOEIC theo từng đề, tự tạo bộ từ cá nhân và ôn tập theo chu kỳ nhớ SM-2 chuẩn Anki.",
  },
  {
    href: "/writing",
    badge: "WRITING & AI COACH",
    title: "Luyện viết TOEIC chấm điểm AI",
    description: "Thực hành viết câu theo tranh (Part 1), phản hồi Email (Part 2) và viết luận (Part 3) với nhận xét chi tiết từ AI.",
  },
  {
    href: "/listen/dictation",
    badge: "VIDEO DICTATION",
    title: "Nghe chép chính tả theo Video",
    description: "Nghe từng phân đoạn video ngắn với 3 mức che 30%, 50%, 100% để nâng cao khả năng bắt âm thực tế.",
  },
  {
    href: "/listen/audio-dictation",
    badge: "SENTENCE DICTATION",
    title: "Nghe chép câu TOEIC",
    description: "Rèn luyện chép chính tả từng câu nghe TOEIC ngắn có gợi ý từ và điều chỉnh tốc độ phát.",
  },
  {
    href: "/practice",
    badge: "MOCK EXAM",
    title: "Phòng thi thử TOEIC 200 câu",
    description: "Thi thử bấm giờ 120 phút hoặc luyện từng Part, quy đổi điểm TOEIC 990 và tự động gom câu sai về kho ôn tập.",
  },
];

export default function LessonsPage() {
  return <>
    <PublicHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-16 sm:px-8">
      <p className="text-sm font-extrabold uppercase tracking-widest text-primary">Bản đồ học tập toàn diện</p>
      <h1 className="mt-3 text-4xl font-extrabold text-ink">Hệ thống bài học & Luyện thi TOEIC</h1>
      <p className="mt-4 max-w-2xl text-muted">Chọn phân hệ bạn muốn rèn luyện hôm nay. Mọi hoạt động đều tự động ghi nhận vào chuỗi ngày học (Streak) và đồng bộ trên tài khoản của bạn.</p>
      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lessonPaths.map((lesson) => <article key={lesson.href} className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-sm transition hover:border-primary">
          <div>
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-[11px] font-extrabold tracking-wider text-primary">{lesson.badge}</span>
            <h2 className="mt-3 text-xl font-extrabold text-ink">{lesson.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{lesson.description}</p>
          </div>
          <Link href={lesson.href} className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-gold-ink">
            Bắt đầu <NavIcon name="arrow-right" className="h-4 w-4" />
          </Link>
        </article>)}
      </section>
    </main>
  </>;
}
