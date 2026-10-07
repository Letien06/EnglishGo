"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RecordValue = Record<string, unknown>;
type ApiEnvelope<T> = { success?: boolean; data?: T; error?: string };

type HistoryItem = {
  id: string;
  promptId: string;
  promptTitle: string;
  part: number | null;
  responseText: string;
  submittedAtMillis: number | null;
  elapsedSeconds: number | null;
  score: number | null;
  maxScore: number | null;
  summary: string;
};

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function stringValue(record: RecordValue | null, ...keys: string[]) {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberValue(record: RecordValue | null, ...keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function unwrap<T>(body: ApiEnvelope<T> | T): T {
  if (body && typeof body === "object" && "data" in body) return (body as ApiEnvelope<T>).data as T;
  return body as T;
}

function normalizeItems(value: unknown): HistoryItem[] {
  const rawItems = Array.isArray(value) ? value : (asRecord(value)?.attempts ?? asRecord(value)?.items);
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map((item, index) => {
    const record = asRecord(item) ?? {};
    const feedback = asRecord(record.feedback) ?? record;
    const prompt = asRecord(record.prompt);
    return {
      id: stringValue(record, "id", "attemptId") || `history-${index}`,
      promptId: stringValue(record, "promptId") || stringValue(prompt, "id"),
      promptTitle: stringValue(record, "promptTitle", "title") || stringValue(prompt, "title") || "Bài luyện Writing",
      part: numberValue(record, "promptPart", "part") ?? numberValue(prompt, "part"),
      responseText: stringValue(record, "responseText", "answer", "text"),
      submittedAtMillis: numberValue(record, "submittedAtMillis", "createdAtMillis", "createdAt"),
      elapsedSeconds: numberValue(record, "elapsedSeconds", "durationSeconds"),
      score: numberValue(feedback, "overallScore", "score", "estimatedScore", "totalScore"),
      maxScore: numberValue(feedback, "maxScore", "totalMaxScore", "outOf"),
      summary: stringValue(feedback, "summary", "overview", "feedback", "assessment"),
    };
  });
}

function formatDate(value: number | null) {
  if (!value) return "Mới lưu";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function formatDuration(value: number | null) {
  if (value == null) return "—";
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function WritingHistoryClient() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [part, setPart] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/writing/attempts/history")
      .then(async (response) => {
        const body = await response.json() as ApiEnvelope<unknown>;
        if (!response.ok || body.success === false) throw new Error(body.error || "Không thể tải lịch sử bài viết.");
        return normalizeItems(unwrap(body));
      })
      .then((next) => { if (!cancelled) setItems(next); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Không thể tải lịch sử bài viết."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => items.filter((item) => part === "all" || item.part === Number(part)), [items, part]);
  const completedParts = new Set(items.map((item) => item.part).filter((item): item is number => item != null));
  const averageScore = useMemo(() => {
    const rated = items.filter((item) => item.score != null && item.maxScore != null && item.maxScore > 0);
    if (!rated.length) return null;
    return Math.round(rated.reduce((sum, item) => sum + ((item.score ?? 0) / (item.maxScore ?? 1)) * 100, 0) / rated.length);
  }, [items]);

  return <main className="app-canvas min-h-[calc(100dvh-4rem)] px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl space-y-6 pb-10"><section className="premium-hero p-6 sm:p-8"><div className="premium-hero-orbit" aria-hidden="true" /><div className="relative"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Writing history</p><div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-extrabold text-ink sm:text-4xl">Nhìn lại cách bạn viết</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">So sánh phản hồi theo từng lần nộp để chọn đúng kỹ năng cần cải thiện ở bài tiếp theo.</p></div><Link href="/writing" className="premium-primary inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline">Luyện bài mới →</Link></div></div></section><section className="grid gap-3 sm:grid-cols-3"><Metric label="Bài đã nộp" value={loading || error ? "—" : items.length} /><Metric label="Điểm trung bình" value={averageScore == null ? "—" : `${averageScore}%`} /><Metric label="Dạng đã luyện" value={loading || error ? "—" : `${completedParts.size}/3`} /></section><section className="premium-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-primary">Danh sách bài nộp</p><h2 className="mt-1 text-xl font-extrabold text-ink">Phản hồi được lưu trên tài khoản của bạn</h2></div><label><span className="sr-only">Lọc lịch sử theo part</span><select value={part} onChange={(event) => setPart(event.target.value)} className="min-w-36 px-3 text-sm font-bold"><option value="all">Tất cả Part</option><option value="1">Part 1 · Picture</option><option value="2">Part 2 · Email</option><option value="3">Part 3 · Essay</option></select></label></div></section>{loading ? <section className="space-y-3" role="status" aria-busy="true" aria-label="Đang tải lịch sử">{Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="h-56 rounded-2xl border border-line bg-surface-soft" />)}</section> : error ? <section className="premium-card p-8 text-center"><p className="font-extrabold text-ink">Chưa tải được lịch sử</p><p className="mt-2 text-sm text-muted">{error}</p></section> : filtered.length === 0 ? <section className="premium-card p-10 text-center"><p className="text-xl font-extrabold text-ink">Chưa có bài viết nào ở đây</p><p className="mt-2 text-sm leading-6 text-muted">Mỗi lần nộp sẽ lưu bài làm và phản hồi AI để bạn dễ theo dõi tiến bộ.</p><Link href="/writing" className="premium-primary mt-5 inline-flex rounded-xl px-4 py-2.5 text-sm font-extrabold no-underline">Bắt đầu luyện viết</Link></section> : <section className="space-y-4">{filtered.map((item) => <HistoryCard key={item.id} item={item} />)}</section>}<p className="text-center text-xs leading-5 text-muted">Điểm trong lịch sử là phản hồi học tập ước tính từ AI, không phải điểm ETS chính thức.</p></div></main>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="premium-metric px-4 py-4"><p className="text-xs font-bold text-muted">{label}</p><strong className="mt-1 block text-2xl font-extrabold text-ink">{value}</strong></article>;
}

function HistoryCard({ item }: { item: HistoryItem }) {
  return <article className="premium-card p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-extrabold text-primary">Part {item.part ?? "?"}</span><span className="text-xs font-bold text-muted">{formatDate(item.submittedAtMillis)}</span>{item.elapsedSeconds != null && <span className="text-xs font-bold text-muted">· {formatDuration(item.elapsedSeconds)}</span>}</div><h3 className="mt-3 text-lg font-extrabold text-ink">{item.promptTitle}</h3></div>{item.score != null && <div className="rounded-xl bg-jade/10 px-3 py-2 text-center"><strong className="block text-xl font-extrabold text-jade">{item.score}/{item.maxScore ?? "?"}</strong><span className="text-[11px] font-bold text-muted">ước tính AI</span></div>}</div>{item.summary && <p className="mt-4 text-sm leading-6 text-ink2">{item.summary}</p>}{item.responseText && <details className="group mt-4 rounded-xl border border-line bg-surface-soft/50 p-4"><summary className="cursor-pointer list-none text-sm font-extrabold text-ink"><span className="mr-2 inline-block text-primary transition-transform group-open:rotate-90" aria-hidden="true">›</span>Xem bài bạn đã nộp</summary><p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm leading-7 text-ink2">{item.responseText}</p></details>}{item.promptId && <Link href={`/writing/practice/${encodeURIComponent(item.promptId)}`} className="mt-4 inline-flex text-sm font-extrabold text-primary hover:underline">Luyện lại đề này →</Link>}</article>;
}
