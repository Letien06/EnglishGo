"use client";

/**
 * Public level metadata is rendered by the server immediately. This client
 * layer overlays the learner's progress after paint, using a per-user cache
 * and refreshing only the part that reports a learning event.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import NavIcon from "@/components/NavIcon";
import ResetLevelButton from "@/components/ResetLevelButton";
import { useAuthenticatedSession } from "@/components/AuthenticatedSessionContext";
import {
  ACTIVE_LEARNER_UPDATED_EVENT,
  LEARNING_LEVELS_UPDATED_EVENT,
  activeLearnerId,
  cacheLearningLevels,
  invalidateLearningLevels,
  isLearningLevelsDirty,
  readCachedLearningLevels,
  type LearningSkill,
} from "@/lib/client-learning-progress-cache";
import { markVisited, routeKey } from "@/lib/nav/session-nav";
import type { DauToeicDifficultyLevel } from "@/types/dautoeic";

const levelStyles = [
  "border-l-4 border-l-emerald-500",
  "border-l-4 border-l-blue-600",
  "border-l-4 border-l-cyan-500",
  "border-l-4 border-l-amber-500",
  "border-l-4 border-l-rose-500",
] as const;

/** Hot copy so a client-side return navigation does not parse localStorage. */
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
  const authenticated = useAuthenticatedSession();
  // Do not read a prior learner's local cache until the lightweight session
  // request has confirmed the current account.
  const initialCachedLevels = authenticated ? readBestCachedLevels(skill, partNum) : null;
  const [levels, setLevels] = useState<DauToeicDifficultyLevel[]>(initialCachedLevels ?? initialLevels);
  const [error, setError] = useState(initialError && !initialCachedLevels);
  const [loading, setLoading] = useState(!initialCachedLevels && initialLevels.length === 0 && !initialError);
  const mounted = useRef(false);
  const levelsRef = useRef(levels);
  const fetchVersionRef = useRef(0);
  const displayedLearnerRef = useRef<string | null>(authenticated ? activeLearnerId() : null);

  useEffect(() => {
    levelsRef.current = levels;
  }, [levels]);

  const fetchLevels = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!authenticated || !activeLearnerId()) return;
      const requestVersion = ++fetchVersionRef.current;
      if (!silent && levelsRef.current.length === 0) setLoading(true);
      try {
        const res = await fetch(
          `${levelsEndpoint}?part=${partNum}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as {
          success: boolean;
          data: {
            levels?: DauToeicDifficultyLevel[];
          levelsByPart?: Record<string, DauToeicDifficultyLevel[]>;
          } | null;
        };
        if (!mounted.current || requestVersion !== fetchVersionRef.current) return;
        if (json.success && json.data) {
          const next = json.data.levelsByPart?.[partId] ?? json.data.levels ?? [];
          cacheLevels(skill, partNum, next);
          setLevels(next);
          setError(false);
        } else if (levelsRef.current.length === 0) {
          setError(true);
        }
      } catch {
        if (
          mounted.current &&
          requestVersion === fetchVersionRef.current &&
          levelsRef.current.length === 0
        ) setError(true);
      } finally {
        if (mounted.current && requestVersion === fetchVersionRef.current && !silent) setLoading(false);
      }
    },
    [authenticated, levelsEndpoint, partId, partNum, skill],
  );

  useEffect(() => {
    mounted.current = true;
    // Mark this dashboard route as visited so the route-level loading overlay
    // does not flash if the user returns to it (or switches Nghe<->Đọc) later
    // in this session. Path mirrors the dashboard pages: /listen or /read.
    const dashboardPath = skill === "listening" ? "/listen" : "/read";
    markVisited(routeKey(dashboardPath, { part: partId }));

    const restoreOrFetch = () => {
      if (!mounted.current) return;
      if (!authenticated) return;
      const uid = activeLearnerId();
      if (displayedLearnerRef.current !== uid) {
        displayedLearnerRef.current = uid;
        fetchVersionRef.current += 1;
        levelsRef.current = initialLevels;
        setLevels(initialLevels);
        setError(initialError);
      }
      if (!uid) return;
      const cached = readBestCachedLevels(skill, partNum);
      if (cached && !isLearningLevelsDirty(skill, partNum)) {
        setLevels(cached);
        setError(false);
        setLoading(false);
        // Stale-while-revalidate: the learner sees their last local progress
        // immediately, while this one visible part is refreshed in the
        // background for work done from another device or a new server event.
        void fetchLevels({ silent: true });
        return;
      }
      void fetchLevels();
    };

    const onLearnerChanged = () => restoreOrFetch();
    const onLevelsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ skill?: LearningSkill; parts?: number[] }>).detail;
      if (detail?.skill === skill && detail.parts?.includes(partNum)) {
        void fetchLevels();
      }
    };

    // The identity arrives independently of the optional streak bootstrap.
    // If there is a 15-day cache, it replaces the public zero-progress view at
    // once; otherwise only this active part is fetched in the background.
    void Promise.resolve().then(restoreOrFetch);
    window.addEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onLearnerChanged);
    window.addEventListener(LEARNING_LEVELS_UPDATED_EVENT, onLevelsUpdated);
    return () => {
      mounted.current = false;
      window.removeEventListener(ACTIVE_LEARNER_UPDATED_EVENT, onLearnerChanged);
      window.removeEventListener(LEARNING_LEVELS_UPDATED_EVENT, onLevelsUpdated);
    };
  }, [authenticated, fetchLevels, initialError, initialLevels, partId, partNum, skill]);

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
          onReset={async () => {
            invalidateLearningLevels(skill, [partNum]);
            await fetchLevels();
          }}
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
  onReset,
  href,
  className,
}: {
  level: DauToeicDifficultyLevel;
  skill: "listening" | "reading";
  partNum: number;
  endpoint: string;
  onReset: () => Promise<void>;
  href: string;
  className: string;
}) {
  const total = level.total ?? 0;
  const hasPracticeItems = total > 0;
  const progress = total > 0 ? Math.round((level.done / total) * 100) : 0;

  return (
    <article className={`premium-card premium-card--interactive p-5 ${className}`}>
      <header className="mb-4 flex items-start gap-4">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface-soft text-xs font-extrabold text-primary">
          Lv{level.level}
        </span>
        <div>
          <h3 className="text-base font-extrabold text-ink">{level.title}</h3>
          <p className="text-xs text-muted">{hasPracticeItems ? "Bài hiện có trong nguồn kết nối" : "Nguồn kết nối chưa cung cấp bài ở level này"}</p>
        </div>
        <span className="ml-auto text-xs text-muted">{level.done}/{total}</span>
      </header>

      <div>
        <div className="mb-2 flex justify-between text-xs font-bold text-muted">
          <span>Tiến độ</span>
          <span>{progress}%</span>
        </div>
        <div className="progress-bar h-1 bg-surface-soft">
          <span style={{ "--progress": progress / 100 } as CSSProperties} />
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
          <ResetLevelButton part={partNum} level={level.level} endpoint={endpoint} onReset={onReset} />
          {hasPracticeItems ? <Link
            href={href}
            data-overdelay={skill === "listening" ? "Đang mở bài luyện nghe..." : "Đang mở bài luyện đọc..."}
            data-overdelay-timeout="9000"
            data-overdelay-wait-for="practice-ready"
            className="premium-primary inline-flex gap-1.5 px-5 py-2 text-sm"
          >
            <NavIcon name="play" className="h-4 w-4" />
            Luyện ngay
          </Link> : <span
            aria-disabled="true"
            title="API nguồn hiện không trả nội dung cho level này; đăng nhập ở trang nguồn không tự cấp quyền cho website này."
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-slate-200 px-5 py-2 text-sm font-extrabold text-slate-500"
          >
            Chưa có dữ liệu
          </span>}
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

function cacheKey(skill: LearningSkill, part: number, uid = activeLearnerId()): string | null {
  return uid ? `${skill}:${uid}:${part}` : null;
}

function readBestCachedLevels(skill: LearningSkill, part: number): DauToeicDifficultyLevel[] | null {
  const key = cacheKey(skill, part);
  const inMemory = key ? sessionCache.get(key) : null;
  if (inMemory && !isLearningLevelsDirty(skill, part)) return inMemory;
  if (isLearningLevelsDirty(skill, part)) return null;
  const persisted = readCachedLearningLevels(skill, part);
  if (persisted && key) sessionCache.set(key, persisted);
  return persisted;
}

function cacheLevels(skill: LearningSkill, part: number, levels: DauToeicDifficultyLevel[]): void {
  const key = cacheKey(skill, part);
  if (key) sessionCache.set(key, levels);
  cacheLearningLevels(skill, part, levels);
}

function SkeletonGrid() {
  return (
    <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="premium-card h-52 animate-pulse border-l-4 border-l-slate-200 p-5"
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
    <section className="premium-card p-8 text-center text-ink">
      <h2 className="text-xl font-extrabold">Tải dữ liệu từ server bị lỗi.</h2>
      <p className="mt-2 text-sm text-muted">Vui lòng thử tải lại trang sau ít phút.</p>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="premium-card p-8 text-center text-muted">
      <p className="text-lg font-extrabold text-ink">Chưa có dữ liệu cho phần này.</p>
      <p className="mt-1 text-sm">Vui lòng thử lại sau.</p>
    </section>
  );
}
