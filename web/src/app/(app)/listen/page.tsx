import Link from "next/link";
import LevelDashboardClient from "../_components/LevelDashboardClient";

const parts = [
  { id: "part1", num: 1, label: "Part 1: Hình ảnh", title: "Luyện Part 1 theo 5 cấp độ", desc: "Câu hỏi lấy từ ngân hàng luyện nghe TOEIC và được phân loại theo tỉ lệ sai thực tế.", badge: "P1" },
  { id: "part2", num: 2, label: "Part 2: Hỏi - Đáp", title: "Luyện Part 2 theo 5 cấp độ", desc: "Luyện phản xạ nghe hỏi đáp ngắn với dữ liệu được chia theo độ khó.", badge: "P2" },
  { id: "part3", num: 3, label: "Part 3: Hội thoại ngắn", title: "Luyện Part 3 theo 5 cấp độ", desc: "Nghe hội thoại TOEIC theo nhóm câu hỏi và tăng dần độ khó.", badge: "P3" },
  { id: "part4", num: 4, label: "Part 4: Độc thoại", title: "Luyện Part 4 theo 5 cấp độ", desc: "Luyện nghe bài nói chuyện, thông báo và bài độc thoại TOEIC.", badge: "P4" },
] as const;

export default async function ListenPage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>;
}) {
  const { part: partParam } = await searchParams;
  const activePart = parts.find((part) => part.id === partParam) ?? parts[0];

  return (
    <main className="app-canvas skill-index-page skill-index-page--listen min-h-[calc(100dvh-4rem)] px-4 py-5 lg:px-8">
      <div className="skill-index-layout grid gap-8 lg:grid-cols-[250px_1fr]">
        <ModuleSidebar activeId={activePart.id} />

        <section className="skill-index-content space-y-8">
          <Hero part={activePart} />

          <section>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-[11px] font-extrabold text-primary">
                  Level practice
                </span>
                <h2 className="mt-2 text-2xl font-extrabold text-ink">
                  Chọn cấp độ luyện nghe
                </h2>
                <p className="text-sm text-muted">
                  Mỗi level được gom theo tỉ lệ sai từ ngân hàng câu hỏi Đậu TOEIC.
                </p>
              </div>
            </div>

            <LevelDashboardClient
              key={activePart.id}
              skill="listening"
              partId={activePart.id}
              partNum={activePart.num}
              initialLevels={[]}
              initialError={false}
              levelsEndpoint="/api/listening/levels"
              resetEndpoint="/api/listening/reset"
              practiceHrefBase="/listen/practice"
            />
          </section>
        </section>
      </div>
    </main>
  );
}

function ModuleSidebar({ activeId }: { activeId: string }) {
  return (
    <aside className="premium-sidebar skill-index-sidebar p-4">
      <header className="mb-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-2xl font-extrabold text-white">
            ♪
          </span>
          <div>
            <h1 className="font-extrabold text-ink">Kỹ năng Nghe</h1>
            <p className="text-[11px] text-muted">Listening · Parts 1 - 4 · Dictation</p>
          </div>
        </div>
      </header>

      <nav className="space-y-3" aria-label="Listening parts">
        {parts.map((part) => {
          const active = part.id === activeId;
          return (
            <Link
              key={part.id}
              href={`/listen?part=${part.id}`}
              aria-current={active ? "page" : undefined}
              className={`skill-index-nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-extrabold no-underline transition-colors ${
                active
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-500/20"
                  : "text-ink2 hover:bg-surface-soft hover:text-ink"
              }`}
            >
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${active ? "bg-white/20" : "bg-primary/10 text-primary"}`}>
                {part.badge}
              </span>
              <span>{part.label}</span>
            </Link>
          );
        })}
        <Link
          href="/listen/dictation"
          className="skill-index-nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-extrabold text-ink2 no-underline transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">✎</span>
          <span>Nghe – chép video</span>
        </Link>
      </nav>

      <p className="mt-40 border-t border-line pt-4 text-[11px] font-extrabold uppercase text-muted">
        ✦ Học đều mỗi ngày để giữ chuỗi
      </p>
    </aside>
  );
}

function Hero({ part }: { part: (typeof parts)[number] }) {
  return (
    <article className="premium-hero premium-reveal skill-index-hero flex min-h-52 items-center justify-between px-6 py-7 sm:px-8 sm:py-8">
      <div className="premium-hero-orbit" aria-hidden="true" />
      <div>
        <h1 className="text-4xl font-extrabold text-ink">{part.title}</h1>
        <p className="mt-3 text-base text-muted">{part.desc}</p>
      </div>
      <div className="premium-hero-icon hidden h-32 w-32 items-center justify-center rounded-3xl text-5xl font-extrabold text-white lg:flex">
        {part.badge}
      </div>
    </article>
  );
}
