"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LEARNING_LEVELS_UPDATED_EVENT } from "@/lib/client-learning-progress-cache";
import { ONLINE_PRESENCE_EVENT, onlineTimeLabel, readOnlinePresence, type OnlinePresence } from "@/lib/client-online-presence";
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
        ? { uid, data: { ...current.data, todayDateKey: studyDateKey(), studiedToday: false, todayActivityCount: 0, onlineSecondsToday: 0, onlineQualifiedToday: false } }
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
    <div className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
    <span className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-extrabold ${statusClass}`} title={studiedToday ? "Đã giữ chuỗi hôm nay" : "Online đủ 10 phút hoặc hoàn thành một hoạt động học để giữ chuỗi"} aria-label={title}>
      <span aria-hidden="true">🔥</span>
      <span>{streakDays}</span>
    </span>
    {uid && <OnlineClock key={uid} uid={uid} confirmed={data?.onlineSecondsToday} qualified={studiedToday} />}
    </div>
  );
}

function OnlineClock({ uid, confirmed, qualified }: { uid: string; confirmed?: number; qualified: boolean }) {
  const [presence, setPresence] = useState<OnlinePresence | undefined>(() => readOnlinePresence(uid));
  useEffect(() => {
    const update = (event: Event) => {
      if ((event as CustomEvent<{ uid: string }>).detail.uid === uid) setPresence(readOnlinePresence(uid));
    };
    window.addEventListener(ONLINE_PRESENCE_EVENT, update);
    return () => window.removeEventListener(ONLINE_PRESENCE_EVENT, update);
  }, [uid]);
  const current = presence?.dateKey === studyDateKey() ? presence : undefined;
  const seconds = current?.seconds ?? confirmed;
  const label = seconds == null ? "--:--" : onlineTimeLabel(seconds);
  const detail = `Hôm nay: ${label}. ${qualified ? "Đã giữ chuỗi hôm nay." : "Online đủ 10 phút hoặc hoàn thành một hoạt động học để giữ chuỗi."} ${current ? `Tổng thời gian truy cập: ${onlineTimeLabel(current.totalSeconds)}. ${!current.synced ? "Đang chờ kết nối." : !current.running ? "Bộ đếm đang tạm dừng." : "Đang tính thời gian."}` : "Đang tải thời gian."}`;
  return <details className="relative text-sm">
    <summary aria-label="Thời gian truy cập" className="inline-flex h-9 cursor-pointer list-none items-center gap-1 rounded-xl border border-line bg-surface-soft px-2.5 font-bold text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-primary" title={detail}>
      <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></svg>
      <span>{label}</span><span className="text-xs text-muted">{qualified ? "✓" : "/ 10:00"}</span>
    </summary>
    <div className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-3 text-xs leading-relaxed text-ink shadow-lg">{detail}</div>
  </details>;
}
