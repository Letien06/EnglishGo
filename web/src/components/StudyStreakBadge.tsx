"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
      try {
        const res = await fetch("/api/study/streak", { cache: "no-store" });
        const json = (await res.json()) as StreakResponse;
        if (cancelled || !json.success || !json.data) return;
        setStreakDays(json.data.streakDays);
        setStudiedToday(json.data.studiedToday);
        setAuthenticated(json.data.authenticated);
      } catch {
        /* keep the last visible value */
      }
    }

    void load();
    const onFocus = () => void load();
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
