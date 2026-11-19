"use client";

import Link from "./IntentLink";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";
import { AuthenticatedSessionProvider } from "./AuthenticatedSessionContext";
import StudyStreakBadge from "./StudyStreakBadge";
import NavIcon, { type NavIconName } from "./NavIcon";
import MobileNavigationMenu from "./MobileNavigationMenu";
import PwaInstallPrompt from "./PwaInstallPrompt";
import HeaderJoinRoomButton from "./HeaderJoinRoomButton";
import StudyOnlineTracker from "./StudyOnlineTracker";
import { clearActiveLearnerCache, setActiveLearnerId } from "@/lib/client-learning-progress-cache";
import { useVocabReviewQueue } from "@/lib/vocab-review-queue";
import { useReadingProgressQueue, useListeningProgressQueue } from "@/lib/reading-progress-queue";

const StudyStreakCelebration = dynamic(() => import("./StudyStreakCelebration"), { ssr: false });
const ScratchPaperHost = dynamic(() => import("./ScratchPaperHost"), { ssr: false, loading: () => null });

const navItems = [
  { href: "/hub", icon: "home", label: "Trang chủ", color: "text-primary" },
  { href: "/listen", icon: "listen", label: "Nghe", color: "text-plum" },
  { href: "/read", icon: "read", label: "Đọc", color: "text-azure" },
  { href: "/writing", icon: "writing", label: "Viết", color: "text-terracotta" },
  { href: "/vocab", icon: "vocab", label: "Từ vựng", color: "text-jade" },
  { href: "/practice", icon: "practice", label: "Đề thi", color: "text-terracotta" },
  { href: "/leaderboard", icon: "leaderboard", label: "Bảng xếp hạng", color: "text-primary" },
] as const satisfies ReadonlyArray<{
  href: string;
  icon: NavIconName;
  label: string;
  color: string;
}>;

type AppBootstrap = {
  authenticated: boolean;
  user: { uid: string; email: string; displayName: string; avatarUrl?: string | null; role: string } | null;
  streak: {
    streakDays: number;
    studiedToday: boolean;
    todayActivityCount: number;
    todayModules: string[];
    todayDateKey: string;
    authenticated: boolean;
  } | null;
};

type BootstrapResponse = {
  success: boolean;
  data: AppBootstrap | null;
};

type AppSession = {
  authenticated: boolean;
  user: AppBootstrap["user"];
};

let cachedBootstrap: AppBootstrap | null = null;
let bootstrapInFlight: Promise<AppBootstrap | null> | null = null;

export function clearAppBootstrapCache(): void {
  cachedBootstrap = null;
  bootstrapInFlight = null;
}

async function loadAppBootstrap(): Promise<AppBootstrap | null> {
  if (cachedBootstrap) return cachedBootstrap;
  if (bootstrapInFlight) return bootstrapInFlight;

  bootstrapInFlight = fetch("/api/app/bootstrap", { cache: "no-store" })
    .then(async (response) => {
      const body = (await response.json()) as BootstrapResponse;
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
  const [session, setSession] = useState<AppSession | null>(() => cachedBootstrap);
  const [sessionResolved, setSessionResolved] = useState(() => cachedBootstrap !== null);
  const authenticated = bootstrap?.authenticated === true;
  const sessionAuthenticated = session?.authenticated === true;
  useVocabReviewQueue(session?.user?.uid, sessionAuthenticated);
  useReadingProgressQueue(session?.user?.uid, sessionAuthenticated);
  useListeningProgressQueue(session?.user?.uid, sessionAuthenticated);
  const isPracticeWorkspace =
    pathname.startsWith("/listen/practice") ||
    pathname.startsWith("/read/practice") ||
    pathname.startsWith("/practice/session") ||
    pathname.startsWith("/writing/practice");
  const isScratchWorkspace =
    pathname.startsWith("/listen") ||
    pathname.startsWith("/read") ||
    pathname.startsWith("/practice");
  const scratchUid = session?.user?.uid ?? bootstrap?.user?.uid ?? null;
  const currentUser = session?.user ?? bootstrap?.user ?? null;
  const userInitial = (currentUser?.displayName || currentUser?.email || "U").trim().charAt(0).toUpperCase() || "U";
  const scratchPaper = isScratchWorkspace ? (
    <Suspense fallback={null}>
      <ScratchPaperHost uid={scratchUid} ready={sessionResolved} />
    </Suspense>
  ) : null;

  useEffect(() => {
    let cancelled = false;
    void loadAppBootstrap().then((nextBootstrap) => {
      if (cancelled) return;
      setBootstrap(nextBootstrap);
      setSession(nextBootstrap);
      setSessionResolved(true);
      if (nextBootstrap?.authenticated && nextBootstrap.user) setActiveLearnerId(nextBootstrap.user.uid);
      else clearActiveLearnerCache();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <StudyOnlineTracker uid={scratchUid} />
      {isPracticeWorkspace ? (
        <AuthenticatedSessionProvider authenticated={sessionAuthenticated || authenticated}>
          {children}
          {scratchPaper}
        </AuthenticatedSessionProvider>
      ) : (
        <AuthenticatedSessionProvider authenticated={sessionAuthenticated || authenticated}>
          <div className="app-shell design-system min-h-dvh text-ink">
            <header className="app-shell-header app-primary-nav sticky top-0 z-50 border-b bg-glass/90 backdrop-blur-xl">
              <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
                <Link href={authenticated ? "/hub" : "/"} className="app-brand flex shrink-0 items-center gap-3 no-underline">
                  <span className="app-brand-mark inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-base font-extrabold text-primary">
                    E
                  </span>
                  <strong className="hidden text-xl font-extrabold tracking-tight text-ink sm:block">
                    ENGLISHGO
                  </strong>
                </Link>

                <nav className="hidden items-center gap-1.5 xl:flex" aria-label="Điều hướng học tập">
                  {navItems.map((item) => {
                    const active =
                      item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`app-primary-nav-link inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-extrabold transition-colors ${
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-ink3 hover:bg-surface-soft hover:text-ink"
                        }`}
                      >
                        <NavIcon name={item.icon} className={`h-4 w-4 shrink-0 ${item.color}`} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                  <MobileNavigationMenu />
                  <PwaInstallPrompt />
                  {authenticated && <HeaderJoinRoomButton />}
                  <div className="inline-flex h-9 shrink-0 items-center gap-1.5 sm:min-w-44" data-streak-slot>
                    {authenticated ? (
                      <StudyStreakBadge
                        uid={session ? session.user?.uid ?? null : bootstrap?.user?.uid ?? null}
                        className="w-full justify-center tabular-nums"
                        initialStreak={
                          session?.user?.uid && session.user.uid !== bootstrap?.user?.uid
                            ? null
                            : bootstrap?.streak ?? null
                        }
                      />
                    ) : !sessionResolved ? (
                      <span
                        aria-hidden="true"
                        className="hidden h-full w-44 rounded-xl border border-line bg-surface-soft opacity-50 sm:inline-block"
                      />
                    ) : null}
                  </div>
                  <ThemeToggle className="!hidden border border-line bg-surface-soft text-ink lg:!inline-flex" />
                  {authenticated ? (
                    <Link
                      href="/account"
                      className={`app-account-control inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 text-base font-extrabold ${
                        pathname.startsWith("/account")
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-line bg-surface text-primary"
                      }`}
                      aria-label="Tài khoản"
                    >
                      {currentUser?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={currentUser.avatarUrl}
                          alt={currentUser.displayName || "Tài khoản"}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        userInitial
                      )}
                    </Link>
                  ) : sessionResolved ? (
                    <div className="flex items-center gap-2">
                      <Link
                        href="/login"
                        className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-extrabold text-ink hover:bg-surface-soft sm:inline-flex"
                      >
                        Đăng nhập
                      </Link>
                      <Link
                        href="/login?mode=register"
                        className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-xl bg-primary px-4 text-sm font-extrabold text-gold-ink"
                      >
                        Đăng ký
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </header>

            {children}
            {scratchPaper}
            {authenticated && <StudyStreakCelebration />}
          </div>
        </AuthenticatedSessionProvider>
      )}
    </>
  );
}
