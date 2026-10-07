"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LEARNING_LEVELS_UPDATED_EVENT } from "@/lib/client-learning-progress-cache";
import { publishStudyStreak, readStudyStreakCache, seedStudyStreak, studyDateKey, STUDY_STREAK_TTL_MS, STUDY_STREAK_UPDATED_EVENT, type StudyStreakSnapshot } from "@/lib/client-study-streak-cache";

export default function StudyStreakBadge({
  uid,
  className,
  hideWhenLoggedOut = true,
  initialStreak = null,
}: {
  uid: string | null;
  className?: string;
  hideWhenLoggedOut?: boolean;
  initialStreak?: StudyStreakSnapshot | null;
}) {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = useState<{ uid: string; data: StudyStreakSnapshot } | null>(() => {
    if (!uid) return null;
    const data = readStudyStreakCache(uid)?.data ?? (initialStreak?.todayDateKey === studyDateKey() ? initialStreak : null);
    return data ? { uid, data } : null;
  });

  useEffect(() => {
    if (!uid) return;
    let disposed = false;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let observedDate = studyDateKey();
    if (initialStreak) seedStudyStreak(uid, initialStreak);

    const applyCache = () => {
      const entry = readStudyStreakCache(uid);
      if (!disposed && entry) setSnapshot({ uid, data: entry.data });
      else if (!disposed) setSnapshot((current) => current?.uid === uid && current.data.todayDateKey !== studyDateKey()
        ? { uid, data: { ...current.data, todayDateKey: studyDateKey(), studiedToday: false, todayActivityCount: 0 } }
        : current);
      return entry;
    };
    const stopRequest = () => {
      request?.abort();
      request = null;
      if (timer) clearTimeout(timer);
    };
    const load = async (force = false, acceptCanonical = false) => {
      if (disposed) return;
      const entry = applyCache();
      const fresh = entry && Date.now() - entry.cachedAt < STUDY_STREAK_TTL_MS;
      if ((fresh && (!force || (acceptCanonical && entry.canonical))) || request) return;
      const controller = new AbortController();
      request = controller;
      try {
        const data = await Promise.race([
          (async () => {
            const response = await fetch("/api/study/streak", { cache: "no-store", signal: controller.signal });
            const body = await response.json() as { success?: boolean; data?: StudyStreakSnapshot | null };
            return response.ok && body.success ? body.data : null;
          })(),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => { controller.abort(); resolve(null); }, 20_000);
          }),
        ]);
        if (!disposed && !controller.signal.aborted && request === controller && data?.authenticated && data.todayDateKey === studyDateKey()) {
          publishStudyStreak(uid, data, false);
        }
      } catch {
        // Keep this learner's last display while an optional refresh fails.
      } finally {
        if (request === controller) {
          request = null;
          if (timer) clearTimeout(timer);
        }
      }
    };
    const onPublished = (event: Event) => {
      if ((event as CustomEvent<{ uid?: string }>).detail?.uid !== uid) return;
      stopRequest();
      applyCache();
    };
    const onFocus = () => { void load(); };
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onActivity = () => { stopRequest(); void load(true); };
    const rolloverTimer = window.setInterval(() => {
      const today = studyDateKey();
      if (today !== observedDate) {
        observedDate = today;
        stopRequest();
        void load(true);
      }
    }, 30_000);
    window.addEventListener(STUDY_STREAK_UPDATED_EVENT, onPublished);
    window.addEventListener(LEARNING_LEVELS_UPDATED_EVENT, onActivity);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    void Promise.resolve().then(() => load(pathname.startsWith("/leaderboard"), true));
    return () => {
      disposed = true;
      stopRequest();
      window.clearInterval(rolloverTimer);
      window.removeEventListener(STUDY_STREAK_UPDATED_EVENT, onPublished);
      window.removeEventListener(LEARNING_LEVELS_UPDATED_EVENT, onActivity);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initialStreak, pathname, uid]);

  const data = snapshot?.uid === uid ? snapshot.data : null;
  const authenticated = Boolean(uid && data?.authenticated);
  if (hideWhenLoggedOut && !authenticated) return null;
  const streakDays = data?.streakDays ?? 0;
  const studiedToday = data?.todayDateKey === studyDateKey() && data?.studiedToday === true;
  const title = studiedToday
    ? `Chuoi hoc ${streakDays} ngay - hom nay da hoc`
    : `Chuoi hoc ${streakDays} ngay - hom nay chua hoc`;
  const statusClass = studiedToday
    ? "border-primary/25 bg-primary/10 text-primary"
    : "border-line bg-surface-soft text-muted";
  return (
    <span className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-extrabold ${statusClass} ${className ?? ""}`} title={title} aria-label={title}>
      <span aria-hidden="true">🔥</span>
      <span>{streakDays}</span>
    </span>
  );
}
