"use client";

/**
 * Public level metadata is rendered by the server immediately. This client
 * layer overlays the learner's progress after paint, using a per-user cache
 * and refreshing only the part that reports a learning event.
 */
import Link from "@/components/IntentLink";
import { useCallback, useEffect, useRef, useState } from "react";
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
    <div className="study-level-grid">
      {levels.map((level) => (
        <LevelCard
          key={level.level}
          level={level}
          partNum={partNum}
          endpoint={resetEndpoint}
          onReset={async () => {
            invalidateLearningLevels(skill, [partNum]);
            await fetchLevels();
          }}
          href={`${practiceHrefBase}?part=${partId}&level=${level.level}&mode=normal&assist=30&q=${nextPracticeIndex(level)}`}
        />
      ))}
    </div>
  );
}

function LevelCard({
  level,
  partNum,
  endpoint,
  onReset,
  href,
}: {
  level: DauToeicDifficultyLevel;
  partNum: number;
  endpoint: string;
  onReset: () => Promise<void>;
  href: string;
}) {
  const total = level.total ?? 0;
  const hasPracticeItems = total > 0;
  const progress = total > 0 ? Math.min(100, Math.round((level.done / total) * 100)) : 0;
  const grouped = level.grouping === "balanced";

  return (
    <article className="study-level-card">
      <header>
        <span className="study-level-number">{String(level.level).padStart(2, "0")}</span>
        <div><h3>{grouped ? `Nhóm ${level.level}` : level.title}</h3><p>{total} {[1, 2, 5].includes(partNum) ? "câu hỏi" : "cụm câu hỏi"}</p></div>
        <span className="study-level-state">{progress === 100 ? "Hoàn thành" : level.done > 0 ? "Đang học" : "Chưa học"}</span>
      </header>
      <div className="study-level-progress">
        <div><span>{level.done}/{total} đã học</span><strong>{progress}%</strong></div>
        <progress max={100} value={progress} aria-label={`Tiến độ ${level.title}`} />
      </div>
      <div className="study-level-stats">
        <span><strong>{level.correct}</strong> đúng</span>
        <span><strong>{level.wrong}</strong> sai</span>
        <span><strong>{level.remaining}</strong> còn lại</span>
      </div>
      <footer>
        {level.done > 0 && <ResetLevelButton part={partNum} level={level.level} endpoint={endpoint} onReset={onReset} grouped={grouped} />}
        {hasPracticeItems ? <Link href={href} className="study-start-link" aria-label={`${level.done > 0 ? "Học tiếp" : "Bắt đầu"} ${level.title}`}>
          {progress === 100 ? "Ôn lại" : level.done > 0 ? "Học tiếp" : "Bắt đầu"}<NavIcon name="arrow-right" />
        </Link> : <span className="study-unavailable">Chưa có bài</span>}
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
    <div className="study-level-grid" role="status" aria-label="Đang tải nhóm bài luyện tập" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <article key={i} className="study-level-card study-level-card--loading" aria-hidden="true">
          <header><span className="study-level-number study-skeleton" /><div className="study-level-placeholder"><div className="study-skeleton study-level-placeholder-title" /><div className="study-skeleton study-level-placeholder-line" /></div></header>
          <div className="study-level-progress"><div className="study-skeleton study-level-placeholder-line" /><div className="study-skeleton study-level-placeholder-track" /></div>
          <div className="study-level-stats">{[1, 2, 3].map((stat) => <span className="study-skeleton study-level-placeholder-stat" key={stat} />)}</div>
          <footer><span className="study-skeleton study-level-placeholder-button" /></footer>
        </article>
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
