"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";
import { AuthenticatedSessionProvider } from "./AuthenticatedSessionContext";
import StudyStreakBadge from "./StudyStreakBadge";
import NavIcon, { type NavIconName } from "./NavIcon";
import MobileNavigationMenu from "./MobileNavigationMenu";
import PwaInstallPrompt from "./PwaInstallPrompt";
import type { PetWidgetSummary } from "@/types/pet";

const PetFloatingWidget = dynamic(() => import("./PetFloatingWidget"), { ssr: false });
const StudyStreakCelebration = dynamic(() => import("./StudyStreakCelebration"), { ssr: false });

const navItems = [
  { href: "/progress", icon: "progress", label: "Tiến bộ", color: "text-primary" },
  { href: "/hub", icon: "home", label: "Trang chủ", color: "text-primary" },
  { href: "/listen", icon: "listen", label: "Nghe", color: "text-plum" },
  { href: "/read", icon: "read", label: "Đọc", color: "text-azure" },
  { href: "/writing", icon: "writing", label: "Viết", color: "text-terracotta" },
  { href: "/vocab", icon: "vocab", label: "Từ vựng", color: "text-jade" },
  { href: "/practice", icon: "practice", label: "Đề thi", color: "text-terracotta" },
  { href: "/pet", icon: "pet", label: "Thú cưng", color: "text-primary" },
  { href: "/leaderboard", icon: "leaderboard", label: "Bảng xếp hạng", color: "text-primary" },
] as const satisfies ReadonlyArray<{
  href: string;
  icon: NavIconName;
  label: string;
  color: string;
}>;

type AppBootstrap = {
  authenticated: boolean;
  user: { uid: string; email: string; displayName: string; role: string } | null;
  streak: {
    streakDays: number;
    studiedToday: boolean;
    todayActivityCount: number;
    todayModules: string[];
    todayDateKey: string;
    authenticated: boolean;
  } | null;
  pet: PetWidgetSummary | null;
};

type BootstrapResponse = {
  success: boolean;
  data: AppBootstrap | null;
};

let cachedBootstrap: AppBootstrap | null = null;
let bootstrapInFlight: Promise<AppBootstrap | null> | null = null;

async function loadAppBootstrap(): Promise<AppBootstrap | null> {
  if (cachedBootstrap) return cachedBootstrap;
  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = fetch("/api/app/bootstrap", { cache: "no-store" })
    .then(async (response) => {
      const body = await response.json() as BootstrapResponse;
      if (!response.ok || !body.success || !body.data) return null;
      cachedBootstrap = body.data;
      return body.data;
    })
    .catch(() => null)
    .finally(() => {
      bootstrapInFlight = null;
    });

  return bootstrapInFlight;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(() => cachedBootstrap);
  const authenticated = bootstrap?.authenticated === true;
  const isPracticeWorkspace =
    pathname.startsWith("/listen/practice") ||
    pathname.startsWith("/read/practice") ||
    pathname.startsWith("/practice/session") ||
    pathname.startsWith("/writing/practice");

  useEffect(() => {
    if (isPracticeWorkspace || cachedBootstrap) return;

    let cancelled = false;
    // Keep first content paint clear of optional account widgets. One compact
    // request supplies their data after the page is already stable.
    const timer = window.setTimeout(() => {
      void loadAppBootstrap().then((nextBootstrap) => {
        if (!cancelled) setBootstrap(nextBootstrap);
      });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isPracticeWorkspace]);

  if (isPracticeWorkspace) {
    return <>{children}</>;
  }

  return (
    <AuthenticatedSessionProvider authenticated={authenticated}>
      <div className="app-shell design-system min-h-dvh text-ink">
      <header className="app-shell-header app-primary-nav sticky top-0 z-50 border-b bg-glass/90 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <Link href="/" className="app-brand flex items-center gap-3 no-underline">
            <span className="app-brand-mark inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-base font-extrabold text-primary">
              E
            </span>
            <strong className="hidden text-xl font-extrabold tracking-tight text-ink sm:block">
              ENGLISHGO
            </strong>
          </Link>

          <nav className="hidden items-center gap-2 xl:flex" aria-label="Điều hướng học tập">
            {navItems.map((item) => {
              const active =
                item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`app-primary-nav-link inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-extrabold transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-ink3 hover:bg-surface-soft hover:text-ink"
                  }`}
                >
                  <NavIcon name={item.icon} className={`h-4 w-4 ${item.color}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <MobileNavigationMenu />
            <PwaInstallPrompt />
            {authenticated && <StudyStreakBadge className="hidden sm:inline-flex" initialStreak={bootstrap?.streak ?? null} />}
            <ThemeToggle className="!hidden border border-line bg-surface-soft text-ink xl:!inline-flex" />
            <Link
              href="/account"
              className={`app-account-control inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 text-base font-extrabold ${
                pathname.startsWith("/account")
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-line bg-surface text-primary"
              }`}
              aria-label="Tài khoản"
            >
              T
            </Link>
          </div>
        </div>
      </header>

        {children}
        {authenticated && <PetFloatingWidget initialSummary={bootstrap?.pet} />}
        {authenticated && <StudyStreakCelebration />}
      </div>
    </AuthenticatedSessionProvider>
  );
}
