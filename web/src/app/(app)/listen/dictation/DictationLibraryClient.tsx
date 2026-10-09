"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DictationLessonCard, getCatalogPage } from "@/lib/services/dictation";
import { fetchWithTimeout } from "@/lib/client-request";
import type { DictationProgressSummary } from "@/types/dictation";

const topics: Array<[string, string]> = [
  ["", "Tất cả chủ đề"], ["DAILY_ENGLISH", "Daily English"], ["WORK_BUSINESS", "Work & Business"],
  ["SCIENCE_TECHNOLOGY", "Science & Technology"], ["SPACE", "Space"], ["NEWS_CULTURE", "News & Culture"],
];

export default function DictationLibraryClient({ initialCatalog }: { initialCatalog: Awaited<ReturnType<typeof getCatalogPage>> }) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const initial = useRef(true);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState("RECOMMENDED");
  const progressByLesson = useMemo(() => new Map(catalog.progress.map((item) => [item.lessonId, item])), [catalog.progress]);
  const { sources, continueLesson, lessons: filtered } = catalog;
  const filters = JSON.stringify({ query, level, topic, duration, source, sort });
  const previousFilters = useRef(filters);
  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    const changed = previousFilters.current !== filters;
    previousFilters.current = filters;
    if (changed && offset !== 0) { setOffset(0); return; }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ ...JSON.parse(filters), offset: String(offset) });
        const response = await fetchWithTimeout(`/api/dictation/lessons?${params}`, { signal: controller.signal }, 15_000);
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || "Chưa tải được thư viện.");
        if (!controller.signal.aborted) { setCatalog(body.data); setError(""); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Chưa tải được thư viện."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, offset, retry]);

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-bg px-4 py-6 lg:px-8">
      <section className="mx-auto max-w-7xl space-y-7">
        <header className="rounded-3xl border border-info-line bg-info-soft p-7 text-info-ink shadow-sm sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-info-ink">Listening practice</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Luyện nghe – chép theo video</h1>
          <p className="mt-3 max-w-2xl text-sm font-medium text-info-ink sm:text-base">Nghe từng đoạn ngắn, đi từ mức che dễ đến full dictation. Học đúng sức với video đã được tuyển chọn.</p>
        </header>

        {continueLesson && (
          <Link href={`/listen/dictation/${continueLesson.id}`} className="flex flex-col gap-4 rounded-2xl border border-teal-line bg-surface p-5 no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-soft text-2xl">▶</div>
            <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-teal-ink">Học tiếp</p><h2 className="truncate text-lg font-extrabold text-ink">{continueLesson.title}</h2><p className="text-sm text-muted">{progressByLesson.get(continueLesson.id)?.completedCount ?? 0}/{continueLesson.segmentCount} đoạn đã hoàn thành</p></div>
            <span className="rounded-xl bg-primary px-4 py-2 text-center text-sm font-extrabold text-gold-ink">Tiếp tục</span>
          </Link>
        )}

        <section className="rounded-2xl bg-surface p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_repeat(5,minmax(0,180px))]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm bài học hoặc nguồn..." className="h-11 rounded-xl border border-line px-4 text-sm outline-none ring-primary focus:ring-2" />
            <select value={level} onChange={(event) => setLevel(event.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"><option value="">Tất cả cấp độ</option>{["A2", "B1", "B2", "C1"].map((item) => <option key={item}>{item}</option>)}</select>
            <select value={topic} onChange={(event) => setTopic(event.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm">{topics.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select value={duration} onChange={(event) => setDuration(event.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"><option value="">Mọi thời lượng</option><option value="SHORT">Dưới 5 phút</option><option value="MEDIUM">5–10 phút</option><option value="LONG">Trên 10 phút</option></select>
            <select value={source} onChange={(event) => setSource(event.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"><option value="">Mọi nguồn</option>{sources.map((item) => <option key={item}>{item}</option>)}</select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"><option value="RECOMMENDED">Đề xuất</option><option value="CONTINUE">Học tiếp</option><option value="SHORTEST">Ngắn nhất</option><option value="NEWEST">Mới nhất</option></select>
          </div>
        </section>

        <section aria-busy={loading}>
          <div className="mb-4 flex items-end justify-between"><div><p className="text-sm font-bold text-primary">THƯ VIỆN</p><h2 className="text-2xl font-extrabold text-ink">Chọn bài phù hợp</h2></div><span className="text-sm font-semibold text-muted">{catalog.total} bài</span></div>
          <p className="min-h-6 text-sm text-muted" role="status">{loading ? "Đang cập nhật danh sách…" : error}{error && !loading && <button onClick={() => setRetry(value => value + 1)} className="ml-2 font-bold text-primary">Thử lại</button>}</p>
          {filtered.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filtered.map((lesson) => <LessonCard key={lesson.id} lesson={lesson} progress={progressByLesson.get(lesson.id) ?? null} />)}</div> : <div className="rounded-2xl border border-dashed border-control-line bg-surface p-12 text-center text-muted">Chưa tìm thấy bài học phù hợp.</div>}
          <nav aria-label="Trang thư viện" className="mt-5 flex justify-center gap-4">
            <button disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 24))} className="rounded-xl border border-line px-4 py-2 disabled:opacity-40">Trang trước</button>
            <span className="py-2">{Math.floor(offset / 24) + 1}</span>
            <button disabled={loading || catalog.nextOffset === null} onClick={() => setOffset(catalog.nextOffset ?? offset)} className="rounded-xl border border-line px-4 py-2 disabled:opacity-40">Trang sau</button>
          </nav>
        </section>
      </section>
    </main>
  );
}

function LessonCard({ lesson, progress }: { lesson: DictationLessonCard; progress: DictationProgressSummary | null }) {
  const percent = progress ? Math.round((progress.completedCount / Math.max(1, lesson.segmentCount)) * 100) : 0;
  return <Link href={`/listen/dictation/${lesson.id}`} className="group overflow-hidden rounded-2xl bg-surface no-underline shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-sky-500 to-indigo-700">{lesson.thumbnailUrl ? <Image src={lesson.thumbnailUrl} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" loading="lazy" className="object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-4xl text-white">♫</div>}<span className="absolute left-3 top-3 rounded-lg bg-surface px-2 py-1 text-xs font-extrabold text-info-ink">{lesson.level}</span><span className="absolute bottom-3 right-3 rounded-lg bg-black/70 px-2 py-1 text-xs font-bold text-white">{formatDuration(lesson.durationSeconds)}</span></div>
    <div className="p-4"><p className="truncate text-xs font-bold text-primary">{lesson.sourceName}</p><h3 className="mt-1 min-h-12 text-base font-extrabold leading-6 text-ink">{lesson.title}</h3><p className="mt-2 text-sm text-muted">{lesson.segmentCount} đoạn nghe–chép</p>{progress ? <><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-soft"><div className="h-full rounded-full bg-teal-soft0" style={{ width: `${percent}%` }} /></div><p className="mt-1 text-xs font-semibold text-muted">{progress.completedCount}/{lesson.segmentCount} đã hoàn thành</p></> : <p className="mt-3 text-xs font-semibold text-muted">Chưa bắt đầu</p>}</div>
  </Link>;
}

function formatDuration(seconds: number) { const minutes = Math.floor(seconds / 60); const remaining = seconds % 60; return `${minutes}:${String(remaining).padStart(2, "0")}`; }
