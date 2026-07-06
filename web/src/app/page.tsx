import Link from "next/link";
import PublicHeader from "@/components/PublicHeader";
import { getCurrentUser } from "@/lib/auth/session";

const features = [
  {
    icon: "▥",
    title: "Ngữ pháp",
    desc: "Chinh phục Part 5 TOEIC với hệ thống bài học và luyện tập theo chủ đề.",
    href: "/read",
  },
  {
    icon: "♪",
    title: "Luyện nghe",
    desc: "Luyện nghe theo nhiều chế độ, bám sát các phần nghe TOEIC thường gặp.",
    href: "/listen",
  },
  {
    icon: "A",
    title: "Từ vựng",
    desc: "Học từ vựng TOEIC theo chủ đề với flashcard và ôn tập lặp lại.",
    href: "/vocab",
  },
  {
    icon: "▧",
    title: "Luyện đề",
    desc: "Làm đề TOEIC có chấm điểm, lưu bài làm và xem lại đáp án chi tiết.",
    href: "/practice",
  },
  {
    icon: "▤",
    title: "Blog",
    desc: "Mẹo làm bài, chiến lược học và kinh nghiệm luyện thi TOEIC.",
    href: "/lessons",
  },
  {
    icon: "▥",
    title: "Luyện đọc",
    desc: "Luyện đọc TOEIC song ngữ Anh-Việt, tập trung hiểu nhanh ý chính.",
    href: "/read",
  },
  {
    icon: "▷",
    title: "Video",
    desc: "Lộ trình học TOEIC qua video bài viết, bài tập và giải thích ngắn gọn.",
    href: "/lessons",
  },
];

const steps = [
  {
    num: "01",
    title: "Chọn kỹ năng muốn luyện",
    desc: "Ngữ pháp, luyện nghe, từ vựng hoặc làm đề thi thử TOEIC.",
  },
  {
    num: "02",
    title: "Làm bài và nhận phản hồi",
    desc: "Bắt đầu làm bài và nhận phản hồi chi tiết cho từng câu trả lời.",
  },
  {
    num: "03",
    title: "Đăng nhập để lưu tiến độ",
    desc: "Theo dõi streak, XP và xem phân tích điểm mạnh/yếu của bạn.",
  },
];

export default async function HomePage() {
  let user: { displayName: string; streakDays: number } | null = null;
  try {
    const appUser = await getCurrentUser();
    if (appUser) {
      user = { displayName: appUser.displayName, streakDays: 0 };
    }
  } catch {
    // The landing page is public; auth failures should not block it.
  }

  return (
    <>
      <PublicHeader user={user} />

      <main className="flex-1">
        <section className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-7xl flex-col items-center justify-center px-5 py-16 text-center sm:px-8 md:py-24">
          <span className="inline-flex rounded-full bg-primary/10 px-5 py-3 text-base font-extrabold text-primary">
            ✦ Nền tảng luyện TOEIC miễn phí cho người học
          </span>
          <h1 className="mt-10 max-w-5xl text-5xl font-extrabold leading-[1.05] text-ink sm:text-6xl lg:text-7xl">
            Luyện TOEIC hiệu quả
            <br />
            <strong className="font-extrabold text-primary">
              Đạt mục tiêu nhanh hơn
            </strong>
          </h1>
          <p className="mt-6 max-w-3xl text-xl font-medium leading-relaxed text-muted">
            Luyện nghe 4 chế độ, luyện đề, học từ vựng, ngữ pháp - tất cả trong một nền tảng.
          </p>
          <div className="mt-12 flex w-full flex-col justify-center gap-4 sm:w-auto sm:flex-row">
            <Link
              href="/login?mode=register"
              className="inline-flex min-h-16 items-center justify-center rounded-xl bg-primary px-10 text-lg font-extrabold text-gold-ink shadow-[0_20px_45px_rgba(224,149,43,0.25)] transition-opacity hover:opacity-90"
            >
              Bắt đầu luyện tập <span className="ml-3">→</span>
            </Link>
            <Link
              href="/practice"
              className="inline-flex min-h-16 items-center justify-center rounded-xl border border-line bg-surface px-10 text-lg font-extrabold text-ink2 transition-colors hover:bg-surface-soft hover:text-ink"
            >
              Làm bài test thử (demo)
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-x-12 gap-y-3 text-base font-medium text-muted">
            <span className="text-jade">✓ <span className="text-muted">Đăng ký miễn phí, bắt đầu ngay</span></span>
            <span className="text-jade">✓ <span className="text-muted">Theo dõi tiến độ học tập</span></span>
            <span className="text-jade">✓ <span className="text-muted">Giải thích chi tiết từng câu</span></span>
          </div>
        </section>

        <section id="features" className="px-5 py-16 sm:px-8 md:py-20">
          <p className="mx-auto mb-10 max-w-3xl text-center text-base font-medium text-muted">
            Hệ thống luyện tập toàn diện, từ ngữ pháp đến luyện nghe, từ vựng đến luyện đề.
          </p>
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="card-elevated flex min-h-56 flex-col gap-3 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-primary/40"
              >
                <span className="text-2xl text-primary">{feature.icon}</span>
                <h2 className="text-lg font-extrabold text-ink">{feature.title}</h2>
                <p className="flex-1 text-sm text-muted">{feature.desc}</p>
                <Link href={feature.href} className="text-sm font-extrabold text-primary hover:underline">
                  Bắt đầu →
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-surface-soft px-5 py-16 sm:px-8 md:py-20">
          <h2 className="mb-10 text-center text-3xl font-extrabold text-ink">
            Cách hoạt động
          </h2>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.num}
                className="card-elevated flex gap-4 rounded-xl border border-line bg-surface p-6"
              >
                <span className="shrink-0 text-2xl font-extrabold text-primary">
                  {step.num}
                </span>
                <div>
                  <h3 className="mb-2 text-base font-extrabold text-ink">{step.title}</h3>
                  <p className="text-sm text-muted">{step.desc}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="px-5 py-16 text-center sm:px-8 md:py-20">
          <h2 className="mb-3 text-3xl font-extrabold text-ink">
            Sẵn sàng nâng cao điểm TOEIC?
          </h2>
          <p className="mb-8 text-base text-muted">
            Tham gia cùng cộng đồng người học đang chinh phục TOEIC mỗi ngày.
          </p>
          <Link
            href="/login?mode=register"
            className="inline-flex min-h-14 items-center justify-center rounded-xl bg-primary px-8 text-base font-extrabold text-gold-ink transition-opacity hover:opacity-90"
          >
            Bắt đầu miễn phí <span className="ml-2">→</span>
          </Link>
        </section>
      </main>

      <footer className="border-t border-line bg-surface px-5 py-10 sm:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <Link href="/" className="mb-3 flex items-center gap-2 no-underline">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-gold-ink">
                E
              </span>
              <strong className="text-sm font-extrabold text-ink">ENGLISHGO</strong>
            </Link>
            <p className="text-xs text-muted">
              Nền tảng luyện TOEIC miễn phí. Ngữ pháp, luyện nghe, từ vựng, đề thi thử - tất cả trong một.
            </p>
          </div>

          <FooterNav
            title="Sản phẩm"
            links={[
              ["Ngữ pháp", "/lessons"],
              ["Luyện nghe", "/listen"],
              ["Từ vựng", "/vocab"],
              ["Đề thi thử", "/practice"],
            ]}
          />
          <FooterNav
            title="Tài nguyên"
            links={[
              ["Blog", "/lessons"],
              ["Lộ trình học", "/hub"],
              ["Bảng xếp hạng", "/community"],
            ]}
          />
          <FooterNav
            title="Hỗ trợ"
            links={[
              ["Tổng quan", "/lessons"],
              ["Liên hệ", "/community"],
            ]}
          />
        </div>
        <p className="mt-8 text-center text-xs text-muted">
          © 2026 ENGLISHGO. Bản quyền được bảo lưu.
        </p>
      </footer>
    </>
  );
}

function FooterNav({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <nav className="flex flex-col gap-2">
      <strong className="text-xs font-extrabold uppercase tracking-wider text-ink2">
        {title}
      </strong>
      {links.map(([label, href]) => (
        <Link key={label} href={href} className="text-xs text-muted transition-colors hover:text-ink">
          {label}
        </Link>
      ))}
    </nav>
  );
}
