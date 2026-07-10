import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";

const lessonPaths = [
  { href: "/read", title: "Ngữ pháp và đọc hiểu", description: "Luyện Part 5, 6 và 7 theo cấp độ." },
  { href: "/listen", title: "Luyện nghe", description: "Luyện Part 1 đến Part 4 với nhiều chế độ hỗ trợ." },
  { href: "/vocab", title: "Từ vựng", description: "Học từ theo chủ đề và ôn tập ngắt quãng." },
  { href: "/practice", title: "Đề thi TOEIC", description: "Thi thử, luyện từng Part và xem lại kết quả." },
];

export default function LessonsPage() {
  return <>
    <PublicHeader />
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-16 sm:px-8">
      <p className="text-sm font-extrabold uppercase tracking-widest text-primary">Thư viện học tập</p>
      <h1 className="mt-3 text-4xl font-extrabold text-ink">Bài học TOEIC</h1>
      <p className="mt-4 max-w-2xl text-muted">Chọn kỹ năng bạn muốn cải thiện. Nội dung blog và video chuyên sâu đang tiếp tục được cập nhật.</p>
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        {lessonPaths.map((lesson) => <article key={lesson.href} className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="text-xl font-extrabold text-ink">{lesson.title}</h2>
          <p className="mt-2 text-sm text-muted">{lesson.description}</p>
          <Link href={lesson.href} className="mt-5 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-gold-ink">Bắt đầu →</Link>
        </article>)}
      </section>
    </main>
  </>;
}
