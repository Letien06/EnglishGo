import Link from "next/link";
import LevelDashboardClient from "../_components/LevelDashboardClient";
import * as dautoeic from "@/lib/services/dautoeic";

const parts = [
  { id: "part5", num: 5, label: "Part 5: Hoàn thành câu", title: "Part 5: Hoàn thành câu", desc: "Luyện câu hỏi ngữ pháp và từ vựng trong từng câu đơn TOEIC.", badge: "▤" },
  { id: "part6", num: 6, label: "Part 6: Hoàn thành đoạn văn", title: "Part 6: Hoàn thành đoạn văn", desc: "Luyện đọc đoạn văn và chọn câu trả lời đúng theo ngữ cảnh.", badge: "≡" },
  { id: "part7", num: 7, label: "Part 7: Đọc hiểu", title: "Part 7: Đọc hiểu", desc: "Luyện đọc hiểu email, thông báo, bài viết và đoạn kép TOEIC.", badge: "▥" },
] as const;

export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{ part?: string }>;
}) {
  const { part: partParam } = await searchParams;
  const activePart = parts.find((part) => part.id === partParam) ?? parts[0];
  const initial = await loadInitialLevels(activePart.num);

  return (
    <main className="app-canvas skill-index-page skill-index-page--read min-h-[calc(100dvh-4rem)] px-4 py-5 lg:px-8">
      <div className="skill-index-layout grid gap-8 lg:grid-cols-[250px_1fr]">
        <ModuleSidebar activeId={activePart.id} />

        <section className="skill-index-content space-y-8">
          <Hero part={activePart} />

          <section>
            <div className="mb-5">
              <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-[11px] font-extrabold text-primary">
                Level practice
              </span>
              <h2 className="mt-2 text-2xl font-extrabold text-ink">
                Chọn cấp độ luyện đọc
              </h2>
              <p className="text-sm text-muted">
                Mỗi level được gom theo tỉ lệ sai từ ngân hàng câu hỏi Đậu TOEIC.
              </p>
            </div>

            <LevelDashboardClient
              key={activePart.id}
              skill="reading"
              partId={activePart.id}
              partNum={activePart.num}
              initialLevels={initial.levels}
              initialError={initial.error}
              levelsEndpoint="/api/reading/levels"
              resetEndpoint="/api/reading/reset"
              practiceHrefBase="/read/practice"
            />
          </section>
        </section>
      </div>
    </main>
  );
}

async function loadInitialLevels(part: number) {
  try {
    return {
      // Render the public level catalog immediately. Personal progress is
      // loaded in the client after paint and cached per learner/part.
      levels: await dautoeic.listReadingDifficultyLevels(part),
      error: false,
    };
  } catch {
    return { levels: [], error: true };
  }
}

function ModuleSidebar({ activeId }: { activeId: string }) {
  return (
    <aside className="premium-sidebar skill-index-sidebar p-4">
      <header className="mb-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-2xl font-extrabold text-white">
            ▥
          </span>
          <div>
            <h1 className="font-extrabold text-ink">Kỹ năng Đọc</h1>
            <p className="text-[11px] text-muted">Reading · Ngữ pháp · Parts 5 - 7</p>
          </div>
        </div>
      </header>

      <nav className="space-y-3" aria-label="Reading parts">
        {parts.map((part) => {
          const active = part.id === activeId;
          return (
            <Link
              key={part.id}
              href={`/read?part=${part.id}`}
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
        <span className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-extrabold text-muted opacity-70">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">文</span>
          Đọc song ngữ (demo)
        </span>
        <span className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-extrabold text-muted opacity-70">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">▥</span>
          Ngữ pháp (demo)
        </span>
      </nav>

      <p className="mt-28 border-t border-line pt-4 text-[11px] font-extrabold uppercase text-muted">
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
