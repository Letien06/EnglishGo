import Link from "next/link";
import { redirect } from "next/navigation";
import PublicHeader from "@/components/PublicHeader";
import NavIcon from "@/components/NavIcon";
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
  const user = await getCurrentUser();
  if (user) redirect("/hub");

  return (
    <>
      <PublicHeader />

      <main className="app-canvas flex-1">
        <section className="landing-hero mx-4 mt-4 flex min-h-[calc(100dvh-7rem)] max-w-none flex-col items-center justify-center px-5 py-16 text-center sm:mx-6 sm:px-8 md:mx-8 md:py-24 lg:mx-auto lg:max-w-7xl">
          <div className="landing-hero-orbit" aria-hidden="true" />
          <span className="landing-kicker landing-reveal inline-flex px-5 py-3 text-base font-extrabold text-primary">
            ✦ Nền tảng luyện TOEIC miễn phí cho người học
          </span>
          <h1 className="landing-display landing-reveal mt-10 max-w-5xl text-5xl font-extrabold leading-[1.05] text-ink sm:text-6xl lg:text-7xl">
            Luyện TOEIC hiệu quả
            <br />
            <strong className="font-extrabold text-primary">
              Đạt mục tiêu nhanh hơn
            </strong>
          </h1>
          <p className="landing-copy landing-reveal mt-6 max-w-3xl text-xl font-medium leading-relaxed text-muted">
            Luyện nghe 4 chế độ, luyện đề, học từ vựng, ngữ pháp - tất cả trong một nền tảng.
          </p>
          <div className="landing-actions landing-reveal mt-12 flex w-full flex-col justify-center gap-4 sm:w-auto sm:flex-row">
            <Link
              href="/login?mode=register"
              className="premium-primary inline-flex min-h-16 gap-2 px-10 text-lg"
            >
              Bắt đầu luyện tập <NavIcon name="arrow-right" className="h-5 w-5" />
            </Link>
            <Link
              href="/practice"
              className="premium-secondary inline-flex min-h-16 gap-2 px-10 text-lg text-ink2"
            >
              <NavIcon name="practice" className="h-5 w-5 text-terracotta" />
              Làm bài test thử (demo)
            </Link>
          </div>
          <div className="landing-proof landing-reveal mt-10 flex flex-wrap justify-center gap-x-12 gap-y-3 text-base font-medium text-muted">
            <span className="text-jade">✓ <span className="text-muted">Đăng ký miễn phí, bắt đầu ngay</span></span>
            <span className="text-jade">✓ <span className="text-muted">Theo dõi tiến độ học tập</span></span>
            <span className="text-jade">✓ <span className="text-muted">Giải thích chi tiết từng câu</span></span>
          </div>
          <LandingStudyPreview />
        </section>

        <section id="features" className="landing-section px-5 py-16 sm:px-8 md:py-20">
          <p className="mx-auto mb-10 max-w-3xl text-center text-base font-medium text-muted">
            Hệ thống luyện tập toàn diện, từ ngữ pháp đến luyện nghe, từ vựng đến luyện đề.
          </p>
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="landing-feature-card premium-card premium-card--interactive flex min-h-56 flex-col gap-3 p-5"
              >
                <span className="text-2xl text-primary">{feature.icon}</span>
                <h2 className="text-lg font-extrabold text-ink">{feature.title}</h2>
                <p className="flex-1 text-sm text-muted">{feature.desc}</p>
                <Link href={feature.href} className="inline-flex items-center gap-1 text-sm font-extrabold text-primary hover:underline">
                  Bắt đầu <NavIcon name="arrow-right" className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-steps mx-4 mb-6 rounded-[1.75rem] px-5 py-16 sm:mx-6 sm:px-8 md:mx-8 md:py-20 lg:mx-auto lg:max-w-7xl">
          <h2 className="mb-10 text-center text-3xl font-extrabold text-ink">
            Cách hoạt động
          </h2>
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.num}
                className="landing-step-card premium-card flex gap-4 p-6"
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

        <section className="landing-cta mx-4 mb-6 px-5 py-16 text-center sm:mx-6 sm:px-8 md:mx-8 md:py-20 lg:mx-auto lg:max-w-7xl">
          <h2 className="mb-3 text-3xl font-extrabold text-ink">
            Sẵn sàng nâng cao điểm TOEIC?
          </h2>
          <p className="mb-8 text-base text-muted">
            Tham gia cùng cộng đồng người học đang chinh phục TOEIC mỗi ngày.
          </p>
          <Link
            href="/login?mode=register"
            className="landing-primary-action inline-flex min-h-14 gap-2 px-8 text-base"
          >
            Bắt đầu miễn phí <NavIcon name="arrow-right" className="h-5 w-5" />
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

function LandingStudyPreview() {
  return (
    <aside className="hero-study-preview" aria-label="Minh họa lộ trình học TOEIC">
      <div className="study-preview-glow" aria-hidden="true" />
      <div className="study-preview-card landing-reveal">
        <div className="study-preview-topline">
          <span>Hôm nay</span>
          <strong>15 phút tập trung</strong>
        </div>
        <div className="study-preview-score">
          <span>TOEIC target</span>
          <strong>750</strong>
          <small>+ 30 điểm từ lộ trình</small>
        </div>
        <div className="study-preview-plan">
          <div className="study-plan-icon">01</div>
          <div>
            <strong>Nghe Part 2</strong>
            <span>8 câu phản xạ nhanh</span>
          </div>
          <b>08′</b>
        </div>
        <div className="study-preview-plan is-next">
          <div className="study-plan-icon">02</div>
          <div>
            <strong>Ôn từ vựng</strong>
            <span>12 từ đến hạn hôm nay</span>
          </div>
          <b>07′</b>
        </div>
        <div className="study-preview-progress">
          <div><span>Tiến độ tuần này</span><strong>4 / 5 ngày</strong></div>
          <i><b /></i>
        </div>
      </div>
      <p className="study-preview-note">Luôn biết bước tiếp theo để tiến gần mục tiêu.</p>
    </aside>
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
