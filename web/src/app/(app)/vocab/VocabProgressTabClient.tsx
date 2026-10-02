"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { VocabProgressSetCard, VocabSetCard } from "@/types/vocab";

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

interface ProgressPayload {
  totalWords: number;
  learnedWords: number;
  masteredWords: number;
  dueWords: number;
  studiedWordsToday: number;
  streakDays: number;
  dailyNewWordGoal: number;
  progressSets: VocabProgressSetCard[];
  practiceOptions: VocabSetCard[];
}

export default function VocabProgressTabClient() {
  const [payload, setPayload] = useState<ProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      setUnauthorized(false);
      try {
        const res = await fetch("/api/vocab/progress", { cache: "no-store" });
        if (res.status === 401) {
          if (!cancelled) setUnauthorized(true);
          return;
        }
        const json = (await res.json()) as ApiEnvelope<ProgressPayload>;
        if (!json.success || !json.data) throw new Error(json.error ?? "Cannot load progress");
        if (!cancelled) {
          setPayload(json.data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unauthorized) {
    return (
      <EmptyPanel
        title="Đăng nhập để xem tiến độ"
        description="Tiến độ học, lịch ôn và số từ đã thuộc được lưu theo tài khoản của bạn."
        actionHref="/login?redirect=/vocab%3Ftab%3Dprogress"
        actionLabel="Đăng nhập"
      />
    );
  }

  if (loading && !payload) return <ProgressSkeleton />;

  if (error || !payload) {
    return (
      <EmptyPanel
        title="Chưa tải được tiến độ"
        description="Dữ liệu tiến độ chưa sẵn sàng. Hãy thử lại sau hoặc vào Bộ từ của tôi để học tiếp."
        actionHref="/vocab?tab=my"
        actionLabel="Bộ từ của tôi"
      />
    );
  }

  const dailyGoal = payload.dailyNewWordGoal;
  const dailyPercent = dailyGoal > 0
    ? Math.min(100, Math.round((payload.studiedWordsToday / dailyGoal) * 100))
    : 0;

  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-ink">Mục tiêu hôm nay</h2>
            <p className="mt-1 text-sm text-muted">
              {payload.dueWords} từ cần ôn · chuỗi học {payload.streakDays} ngày
            </p>
          </div>
          <Link
            href="/vocab?tab=my"
            data-overdelay="Đang mở bộ từ của tôi..."
            className="rounded-full border border-line px-4 py-2 text-xs font-extrabold text-ink hover:bg-primary-soft"
          >
            Quản lý bộ từ
          </Link>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-[var(--info-soft)] p-4">
            <p className="text-sm font-extrabold text-[var(--info-ink)]">Ôn tập</p>
            <p className="mt-2 text-3xl font-extrabold text-ink">{payload.dueWords} <span className="text-sm text-muted">từ</span></p>
          </div>
          <div className="rounded-xl bg-[var(--success-soft)] p-4">
            <p className="text-sm font-extrabold text-[var(--success-ink)]">Từ mới</p>
            <p className="mt-2 text-3xl font-extrabold text-ink">{payload.studiedWordsToday}<span className="text-sm text-muted">/{dailyGoal} từ</span></p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
              <span className="block h-full rounded-full bg-[var(--success-line)]" style={{ width: `${dailyPercent}%` }} />
            </div>
            <p className="mt-2 text-xs font-bold text-[var(--success-ink)]">{dailyPercent}% hoàn thành</p>
          </div>
        </div>
      </article>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Đã theo dõi" value={payload.totalWords} />
        <StatCard label="Đã học" value={payload.learnedWords} />
        <StatCard label="Thành thạo" value={payload.masteredWords} />
        <StatCard label="Cần ôn" value={payload.dueWords} />
      </section>

      {payload.progressSets.length === 0 ? (
        <EmptyPanel
          title="Chưa có tiến độ học"
          description="Học một bộ từ hoặc mở game trong Bộ từ của tôi để hệ thống lưu tiến độ và lịch ôn."
        />
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          {payload.progressSets.map((set) => {
            const masteredPercent = set.totalWords > 0 ? Math.round((set.masteredWords / set.totalWords) * 100) : 0;
            const learningWords = Math.max(0, set.learnedWords - set.masteredWords);
            const dautoeicHref = set.sourceType === "DAUTOEIC" && set.externalTestId
              ? `/vocab/dautoeic/${encodeURIComponent(set.externalTestId)}`
              : null;
            const detailHref = dautoeicHref ?? `/vocab/${set.id}`;
            return (
              <article key={set.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                <header className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xl font-extrabold text-primary">
                    {set.icon || "*"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-primary">{set.topic}</p>
                    <h3 className="mt-1 line-clamp-2 text-base font-extrabold text-ink">{set.title}</h3>
                  </div>
                  <b className={set.dueWords > 0 ? "text-sm text-[var(--danger-ink)]" : "text-sm text-[var(--success-ink)]"}>
                    {set.dueWords > 0 ? `${set.dueWords} cần ôn` : `${masteredPercent}%`}
                  </b>
                </header>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-soft">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${masteredPercent}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted">
                  <span>{set.masteredWords}/{set.totalWords} đã thuộc</span>
                  <span>{set.learnedWords} đã học</span>
                  <span>{learningWords} đang học</span>
                </div>
                <footer className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={detailHref}
                    data-overdelay="Đang mở chi tiết bộ từ..."
                    className="rounded-full border border-line px-4 py-2 text-xs font-extrabold text-ink hover:bg-primary-soft"
                  >
                    {dautoeicHref ? "Chọn Part" : "Xem chi tiết"}
                  </Link>
                  <Link
                    href={dautoeicHref ?? (set.dueWords > 0 ? `/vocab/${set.id}/flashcards?mode=menu&mastery=due&order=random&amount=20` : `/vocab/${set.id}/flashcards?mode=menu`)}
                    data-overdelay="Đang nạp game từ vựng..."
                    className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-gold-ink hover:opacity-90"
                  >
                    {dautoeicHref ? "Chọn Part để học" : set.dueWords > 0 ? "Chọn chế độ ôn" : "Học tiếp"}
                  </Link>
                </footer>
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}

function ProgressSkeleton() {
  return (
    <section className="space-y-5">
      <article className="h-48 animate-pulse rounded-2xl border border-line bg-surface p-5 shadow-sm" />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="h-24 animate-pulse rounded-2xl border border-line bg-surface p-4 shadow-sm" />
        ))}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <article key={index} className="h-40 animate-pulse rounded-2xl border border-line bg-surface p-5 shadow-sm" />
        ))}
      </section>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <span className="text-lg text-primary">*</span>
      <p className="mt-2 text-xs font-extrabold text-muted">{label}</p>
      <strong className="mt-1 block text-2xl text-ink">{value}</strong>
    </article>
  );
}

function EmptyPanel({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="flex min-h-52 items-center justify-center rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
      <div>
        <div className="mx-auto mb-5 text-3xl text-amber-200">*</div>
        <h2 className="text-xl font-extrabold text-ink">{title}</h2>
        <p className="mt-3 max-w-xl text-sm text-muted">{description}</p>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            data-overdelay="Đang mở trang..."
            className="mt-5 inline-flex rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-gold-ink"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
