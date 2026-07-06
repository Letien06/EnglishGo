"use client";

/**
 * Client-side level dashboard with a session (in-memory) cache.
 *
 * Why: the /listen and /read pages are Server Components, so Next.js re-runs
 * them (including the per-user Firestore progress query) on EVERY navigation,
 * flashing the loading overlay each time. This component keeps an SWR-style
 * cache keyed by `skill:partId` that lives for the browser session:
 *
 *   - First visit for a part: use the SSR `initialLevels`, then revalidate
 *     silently in the background and store the result in the cache.
 *   - Returning to the same part later: render the cached levels INSTANTLY
 *     (no overlay, no reload), then revalidate silently.
 *   - After a part loads: prefetch sibling parts in the background so switching
 *     Part 1 -> Part 2 or Part 5 -> Part 6 usually reuses hot client cache.
 *
 * Progress is still kept fresh because we always revalidate in the background
 * and, critically, we refresh when the tab/window regains focus (e.g. after
 * finishing a practice session and navigating back).
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ResetLevelButton from "@/components/ResetLevelButton";
import { markVisited, routeKey } from "@/lib/nav/session-nav";
import type { DauToeicDifficultyLevel } from "@/types/dautoeic";

const levelStyles = [
  "border-l-4 border-l-emerald-500",
  "border-l-4 border-l-blue-600",
  "border-l-4 border-l-cyan-500",
  "border-l-4 border-l-amber-500",
  "border-l-4 border-l-rose-500",
] as const;

/** Module-level cache: survives client-side navigations within a session. */
const sessionCache = new Map<string, DauToeicDifficultyLevel[]>();

interface Props {
  skill: "listening" | "reading";
  partId: string;
  partNum: number;
  initialLevels: DauToeicDifficultyLevel[];
  initialError: boolean;
  levelsEndpoint: string;
  resetEndpoint: string;
  practiceHrefBase: string;
}

export default function LevelDashboardClient({
  skill,
  partId,
  partNum,
  initialLevels,
  initialError,
  levelsEndpoint,
  resetEndpoint,
  practiceHrefBase,
}: Props) {
  const cacheKey = `${skill}:${partId}`;
  const cached = sessionCache.get(cacheKey);

  // Seed the SSR levels into the cache on first render so a later return visit
  // has data immediately (without waiting for a fetch).
  if (!cached && !initialError && initialLevels.length > 0) {
    sessionCache.set(cacheKey, initialLevels);
  }

  const [levels, setLevels] = useState<DauToeicDifficultyLevel[]>(
    cached ?? initialLevels,
  );
  const [error, setError] = useState(initialError && !cached);
  // Overlay only when we have nothing to show yet.
  const [loading, setLoading] = useState(
    !cached && initialLevels.length === 0 && !initialError,
  );
  const mounted = useRef(true);

  const fetchLevels = useCallback(
    async (showOverlay: boolean) => {
      if (showOverlay) setLoading(true);
      try {
        const res = await fetch(
          `${levelsEndpoint}?part=${partNum}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as {
          success: boolean;
          data: { levels: DauToeicDifficultyLevel[] } | null;
        };
        if (!mounted.current) return;
        if (json.success && json.data) {
          const next = json.data.levels;
          sessionCache.set(cacheKey, next);
          setLevels(next);
          setError(false);
        } else if (levels.length === 0) {
          setError(true);
        }
      } catch {
        if (mounted.current && levels.length === 0) setError(true);
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [cacheKey, levelsEndpoint, partNum, levels.length],
  );

  const prefetchSiblingLevels = useCallback(
    async (signal: AbortSignal) => {
      const partNums = skill === "listening" ? [1, 2, 3, 4] : [5, 6, 7];
      for (const nextPartNum of partNums) {
        if (signal.aborted || nextPartNum === partNum) continue;
        const nextPartId = `part${nextPartNum}`;
        const nextCacheKey = `${skill}:${nextPartId}`;
        if (sessionCache.has(nextCacheKey)) continue;

        try {
          const res = await fetch(`${levelsEndpoint}?part=${nextPartNum}`, {
            cache: "no-store",
            signal,
          });
          const json = (await res.json()) as {
            success: boolean;
            data: { levels: DauToeicDifficultyLevel[] } | null;
          };
          if (json.success && json.data && !signal.aborted) {
            sessionCache.set(nextCacheKey, json.data.levels);
          }
        } catch {
          // Background prefetch is best-effort; the destination part can fetch on demand.
        }
      }
    },
    [levelsEndpoint, partNum, skill],
  );

  useEffect(() => {
    mounted.current = true;
    // Mark this dashboard route as visited so the route-level loading overlay
    // does not flash if the user returns to it (or switches Nghe<->Đọc) later
    // in this session. Path mirrors the dashboard pages: /listen or /read.
    const dashboardPath = skill === "listening" ? "/listen" : "/read";
    markVisited(routeKey(dashboardPath, { part: partId }));
    // Always revalidate silently in the background on mount (or with an overlay
    // when we truly have nothing to display).
    const revalidateTimer = window.setTimeout(() => {
      void fetchLevels(levels.length === 0 && !error);
    }, 0);
    const abortController = new AbortController();
    const prefetchTimer = window.setTimeout(() => {
      void prefetchSiblingLevels(abortController.signal);
    }, 450);
    // Refresh when the user comes back to the tab (e.g. returning from a
    // practice session) so progress numbers stay current.
    const onFocus = () => void fetchLevels(false);
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      window.clearTimeout(revalidateTimer);
      window.clearTimeout(prefetchTimer);
      abortController.abort();
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  if (loading && levels.length === 0) {
    return <SkeletonGrid />;
  }
  if (error && levels.length === 0) {
    return <LoadError />;
  }
  if (levels.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
      {levels.map((level, index) => (
        <LevelCard
          key={level.level}
          level={level}
          skill={skill}
          partNum={partNum}
          endpoint={resetEndpoint}
          href={`${practiceHrefBase}?part=${partId}&level=${level.level}&mode=normal&assist=30&q=${nextPracticeIndex(level)}`}
          className={levelStyles[index] ?? levelStyles[0]}
        />
      ))}
    </div>
  );
}

function LevelCard({
  level,
  skill,
  partNum,
  endpoint,
  href,
  className,
}: {
  level: DauToeicDifficultyLevel;
  skill: "listening" | "reading";
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
            data-overdelay={skill === "listening" ? "Đang mở bài luyện nghe..." : "Đang mở bài luyện đọc..."}
            data-overdelay-timeout="9000"
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

function SkeletonGrid() {
  return (
    <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-52 animate-pulse rounded-xl border-l-4 border-l-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="h-3 w-1/2 rounded bg-slate-100" />
            </div>
          </div>
          <div className="h-1 rounded-full bg-slate-100" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="h-8 rounded-md bg-slate-100" />
            <div className="h-8 rounded-md bg-slate-100" />
            <div className="h-8 rounded-md bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
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
