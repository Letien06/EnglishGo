"use client";

import { useEffect, useState } from "react";
import Link from "@/components/IntentLink";
import ReadingSectionNav from "@/components/ReadingSectionNav";
import type { GrammarCatalog } from "@/lib/storage/grammar-snapshot";
import { GRAMMAR_GROUPS, grammarTopicGroup, grammarStorageKey, readGrammarAnswers, getGrammarProgress, type GrammarAnswerKey, type GrammarAnswers } from "@/lib/grammar-learning";

const groups = GRAMMAR_GROUPS;
type Group = typeof groups[number];
function groupFor(topic: GrammarCatalog["topics"][number]): Group {
  return grammarTopicGroup(topic.bigTopic);
}

export default function GrammarLibraryClient({ catalog, learnerId, answerKeys }: { catalog: GrammarCatalog | null; learnerId: string; answerKeys: Record<string, GrammarAnswerKey> }) {
  const [filter, setFilter] = useState<Group | "all">("all");
  const [answersByTopic, setAnswersByTopic] = useState<Record<string, GrammarAnswers>>({});
  const [progressReady, setProgressReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const topics = catalog?.topics ?? [];
  const totalQuestions = topics.reduce((sum, topic) => sum + topic.questionCount, 0);
  useEffect(() => {
    function refresh() {
      const answers: Record<string, GrammarAnswers> = {};
      try {
        for (const topic of catalog?.topics ?? []) answers[topic.id] = readGrammarAnswers(localStorage.getItem(grammarStorageKey(learnerId, topic.id)), answerKeys[topic.id] ?? {});
        setStorageAvailable(true);
      } catch { setStorageAvailable(false); }
      setAnswersByTopic(answers);
      setProgressReady(true);
    }
    // Restore device progress and refresh it when returning from a study page.
    refresh();
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("pageshow", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); };
  }, [answerKeys, catalog, learnerId]);
  return <main className="mx-auto w-full max-w-7xl p-5 md:p-8">
    <ReadingSectionNav selected="grammar" />
    <header className="mt-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-extrabold uppercase tracking-wider text-teal-ink">Luyện đọc</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">Ngữ pháp</h1><p className="mt-2 text-sm leading-relaxed text-muted">Chọn chủ đề để luyện tập, xem giải thích và bản dịch sau mỗi câu.</p></div>
      <p className="rounded-xl border border-teal-line bg-teal-soft px-4 py-3 text-sm font-bold text-teal-ink">{topics.length} chủ đề · {totalQuestions.toLocaleString("vi-VN")} câu hỏi</p>
    </header>
    <nav aria-label="Nhóm chủ đề ngữ pháp" className="mt-6 flex flex-wrap gap-2">
      {(["all", ...groups] as const).map((group) => <button type="button" key={group} aria-pressed={filter === group} onClick={() => setFilter(group)} className={`min-h-10 rounded-full border px-4 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink ${filter === group ? "border-teal-line bg-teal-soft text-teal-ink" : "border-line bg-surface text-muted hover:text-ink"}`}>{group === "all" ? "Tất cả" : group}</button>)}
    </nav>
    {!topics.length && <p className="mt-8 rounded-2xl border border-line bg-surface p-6 text-muted">Chưa có bài ngữ pháp. Vui lòng thử lại sau.</p>}
    {groups.filter((group) => filter === "all" || filter === group).map((group) => {
      const entries = topics.filter((topic) => groupFor(topic) === group);
      if (!entries.length) return null;
      return <section key={group} aria-labelledby={`grammar-group-${groups.indexOf(group)}`} className="mt-8">
        <div className="mb-4 flex flex-wrap items-baseline gap-3"><h2 id={`grammar-group-${groups.indexOf(group)}`} className="text-xl font-extrabold text-ink">{group}</h2><p className="text-sm text-muted">{entries.length} chủ đề · {entries.reduce((sum, topic) => sum + topic.questionCount, 0).toLocaleString("vi-VN")} câu</p></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((topic) => {
            const progress = getGrammarProgress(answerKeys[topic.id] ?? {}, answersByTopic[topic.id] ?? {});
            const progressKnown = progressReady && storageAvailable;
            const percent = topic.questionCount ? Math.round(progress.answered / topic.questionCount * 100) : 0;
            return <article key={topic.id} className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-start gap-3"><span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-soft text-teal-ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5"><path d="M4 5h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4V5Zm16 0h-4a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h4V5Z" /></svg></span><div><h3 className="text-lg font-extrabold leading-snug text-ink">{topic.title}</h3><p className="mt-1 text-sm text-muted">{topic.questionCount} câu hỏi · {topic.subtopics.length} chuyên đề</p></div></div>
            <div className="mt-5 flex-1">
              <div className="flex justify-between gap-2 text-xs"><p className="text-muted">Đã làm {progressKnown ? progress.answered : "—"}/{topic.questionCount}</p><span className="font-bold tabular-nums text-teal-ink">{progressKnown ? `${percent}%` : "—"}</span></div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-soft" role="progressbar" aria-label={`Tiến độ ${topic.title}`} aria-valuemin={0} aria-valuemax={topic.questionCount} aria-valuenow={progressKnown ? progress.answered : undefined}><div className="h-full rounded-full bg-teal-ink" style={{ width: `${progressKnown ? percent : 0}%` }} /></div>
              <p className="mt-3 text-xs text-muted">Đúng <span className="font-bold text-teal-ink">{progressKnown ? progress.correct : "—"}</span> · Sai <span className="font-bold text-ink">{progressKnown ? progress.wrong : "—"}</span><span className="mt-1 block">{!progressReady ? "Đang đọc tiến độ…" : !storageAvailable ? "Không đọc được tiến độ thiết bị" : "Lưu trên thiết bị này"}</span></p>
            </div>
            <Link href={`/read/grammar/${encodeURIComponent(topic.slug)}`} className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-soft px-4 py-3 text-sm font-extrabold text-teal-ink hover:bg-teal-soft/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink">{progressKnown && progress.answered > 0 ? "Học tiếp" : "Học ngay"} <span aria-hidden="true">→</span></Link>
          </article>; })}
        </div>
      </section>;
    })}
  </main>;
}
