"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CACHE_TTL_MS = 60 * 1000;

type StreakResponse = {
  success: boolean;
  data: {
    streakDays: number;
    studiedToday: boolean;
    todayActivityCount: number;
    authenticated: boolean;
  } | null;
  error: string | null;
};

let cachedStreak: StreakResponse["data"] | null = null;
let cachedAt = 0;
let inFlight: Promise<StreakResponse["data"] | null> | null = null;

async function fetchStreak(): Promise<StreakResponse["data"] | null> {
  if (cachedStreak && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedStreak;
  }
  if (inFlight) return inFlight;

  inFlight = fetch("/api/study/streak", { cache: "no-store" })
    .then(async (res) => {
      const json = (await res.json()) as StreakResponse;
      if (!json.success || !json.data) return null;
      cachedStreak = json.data;
      cachedAt = Date.now();
      return json.data;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export default function StudyStreakBadge({
  className,
  hideWhenLoggedOut = true,
}: {
  className?: string;
  hideWhenLoggedOut?: boolean;
}) {
  const pathname = usePathname();
  const [streakDays, setStreakDays] = useState(0);
  const [studiedToday, setStudiedToday] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const data = await fetchStreak();
      if (cancelled || !data) return;
      setStreakDays(data.streakDays);
      setStudiedToday(data.studiedToday);
      setAuthenticated(data.authenticated);
    }

    void load();
    const onFocus = () => {
      cachedAt = 0;
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  if (hideWhenLoggedOut && !authenticated) return null;

  const title = studiedToday
    ? `Chuoi hoc ${streakDays} ngay - hom nay da hoc`
    : `Chuoi hoc ${streakDays} ngay - hom nay chua hoc`;

  return (
    <span
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface-soft px-3 text-sm font-extrabold text-primary ${className ?? ""}`}
      title={title}
      aria-label={title}
    >
      <span aria-hidden="true">🔥</span>
      <span>{streakDays}</span>
    </span>
  );
}
