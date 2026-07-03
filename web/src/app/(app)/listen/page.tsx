import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import * as listening from "@/lib/services/listening";
import type { DauToeicDifficultyLevel } from "@/types/dautoeic";
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
  const user = await getCurrentUser();

  let levels: DauToeicDifficultyLevel[] = [];
  let loadError = false;
  try {
    levels = await dautoeic.listDifficultyLevels(activePart.num);
    levels = await listening.applyProgress(user?.uid ?? null, levels);
  } catch {
    loadError = true;
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-[#eaf0f8] px-5 py-5 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        <ModuleSidebar activeId={activePart.id} />

        <section className="space-y-8">
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
              skill="listening"
              partId={activePart.id}
              partNum={activePart.num}
              initialLevels={levels}
              initialError={loadError}
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
    <aside className="rounded-2xl bg-white p-4 shadow-[0_12px_35px_rgba(15,27,45,0.08)]">
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
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-extrabold no-underline transition-colors ${
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
      </nav>

      <p className="mt-40 border-t border-line pt-4 text-[11px] font-extrabold uppercase text-muted">
        ✦ Học đều mỗi ngày để giữ chuỗi
      </p>
    </aside>
  );
}

function Hero({ part }: { part: (typeof parts)[number] }) {
  return (
    <article className="flex min-h-48 items-center justify-between overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-r from-sky-100 via-white to-amber-100 px-8 py-8 shadow-[0_20px_45px_rgba(15,27,45,0.08)]">
      <div>
        <span className="inline-flex rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-extrabold text-blue-600">
          Dữ liệu Đậu TOEIC API
        </span>
        <h1 className="mt-5 text-4xl font-extrabold text-ink">{part.title}</h1>
        <p className="mt-2 text-base text-muted">{part.desc}</p>
      </div>
      <div className="hidden h-32 w-32 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 to-cyan-500 text-5xl font-extrabold text-white shadow-2xl lg:flex">
        {part.badge}
      </div>
    </article>
  );
}
