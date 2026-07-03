import Link from "next/link";
import ResetLevelButton from "@/components/ResetLevelButton";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import * as listening from "@/lib/services/listening";
import type { DauToeicDifficultyLevel } from "@/types/dautoeic";

const parts = [
  { id: "part1", num: 1, label: "Part 1: Hình ảnh", title: "Luyện Part 1 theo 5 cấp độ", desc: "Câu hỏi lấy từ ngân hàng luyện nghe TOEIC và được phân loại theo tỉ lệ sai thực tế.", badge: "P1" },
  { id: "part2", num: 2, label: "Part 2: Hỏi - Đáp", title: "Luyện Part 2 theo 5 cấp độ", desc: "Luyện phản xạ nghe hỏi đáp ngắn với dữ liệu được chia theo độ khó.", badge: "P2" },
  { id: "part3", num: 3, label: "Part 3: Hội thoại ngắn", title: "Luyện Part 3 theo 5 cấp độ", desc: "Nghe hội thoại TOEIC theo nhóm câu hỏi và tăng dần độ khó.", badge: "P3" },
  { id: "part4", num: 4, label: "Part 4: Độc thoại", title: "Luyện Part 4 theo 5 cấp độ", desc: "Luyện nghe bài nói chuyện, thông báo và bài độc thoại TOEIC.", badge: "P4" },
] as const;

const levelStyles = [
  "border-l-4 border-l-emerald-500",
  "border-l-4 border-l-blue-600",
  "border-l-4 border-l-cyan-500",
  "border-l-4 border-l-amber-500",
  "border-l-4 border-l-rose-500",
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

            {loadError ? (
              <LoadError />
            ) : levels.length > 0 ? (
              <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                {levels.map((level, index) => (
                  <LevelCard
                    key={level.level}
                    level={level}
                    partNum={activePart.num}
                    endpoint="/api/listening/reset"
                    href={`/listen/practice?part=${activePart.id}&level=${level.level}&mode=normal&assist=30&q=${nextPracticeIndex(level)}`}
                    className={levelStyles[index] ?? levelStyles[0]}
                  />
                ))}
              </div>
            ) : (
              <EmptyState />
            )}
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

function LevelCard({
  level,
  partNum,
  endpoint,
  href,
  className,
}: {
  level: DauToeicDifficultyLevel;
  partNum: number;
  endpoint: string;
  href: string;
  className: string;
}) {
  const total = level.total ?? 0;
  const progress = total > 0 ? Math.round((level.done / total) * 100) : 0;

  return (
    <article className={`rounded-xl bg-white p-5 shadow-sm ${className}`}>
      <header className="mb-4 flex items-start gap-4">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-soft text-xs font-extrabold text-primary">
          Lv{level.level}
        </span>
        <div>
          <h3 className="text-base font-extrabold text-ink">{level.title}</h3>
          <p className="text-xs text-muted">
            Tỉ lệ sai: {Math.round((level.errorRateMin ?? 0) * 100)}% - {Math.round((level.errorRateMax ?? 0) * 100)}%
          </p>
        </div>
        <span className="ml-auto text-xs text-muted">{level.done}/{total}</span>
      </header>

      <div>
        <div className="mb-2 flex justify-between text-xs font-bold text-muted">
          <span>Tiến độ</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-slate-200">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-extrabold">
        <span className="rounded-md bg-slate-100 py-2">✓ {level.correct}</span>
        <span className="rounded-md bg-slate-100 py-2">× {level.wrong}</span>
        <span className="rounded-md bg-slate-100 py-2">○ {level.remaining}</span>
      </div>

      <footer className="mt-5 flex items-center justify-between">
        <span className="text-xs font-extrabold text-muted">{total} item</span>
        <div className="flex items-center gap-3">
          <ResetLevelButton part={partNum} level={level.level} endpoint={endpoint} />
          <Link
            href={href}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-extrabold text-gold-ink shadow-md transition-opacity hover:opacity-90"
          >
            Luyện ngay →
          </Link>
        </div>
      </footer>
    </article>
  );
}

function nextPracticeIndex(level: DauToeicDifficultyLevel) {
  const total = level.total ?? 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, level.done));
}

function LoadError() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-8 text-center text-ink shadow-sm">
      <h2 className="text-xl font-extrabold">Tải dữ liệu từ server bị lỗi.</h2>
      <p className="mt-2 text-sm text-muted">Vui lòng thử tải lại trang sau ít phút.</p>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-2xl bg-white p-8 text-center text-muted shadow-sm">
      <p className="text-lg font-extrabold text-ink">Chưa có dữ liệu cho phần này.</p>
      <p className="mt-1 text-sm">Vui lòng thử lại sau.</p>
    </section>
  );
}
