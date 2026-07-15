"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ThemeToggle from "./ThemeToggle";
import StudyStreakBadge from "./StudyStreakBadge";
import NavIcon, { type NavIconName } from "./NavIcon";
import MobileNavigationMenu from "./MobileNavigationMenu";
import PetFloatingWidget from "./PetFloatingWidget";

const navItems = [
  { href: "/pet", icon: "pet", label: "Thú cưng", color: "text-primary" },
  { href: "/hub", icon: "home", label: "Trang chủ", color: "text-primary" },
  { href: "/listen", icon: "listen", label: "Nghe", color: "text-plum" },
  { href: "/read", icon: "read", label: "Đọc", color: "text-azure" },
  { href: "/vocab", icon: "vocab", label: "Từ vựng", color: "text-jade" },
  { href: "/practice", icon: "practice", label: "Đề thi", color: "text-terracotta" },
  { href: "/leaderboard", icon: "leaderboard", label: "Bảng xếp hạng", color: "text-primary" },
] as const satisfies ReadonlyArray<{
  href: string;
  icon: NavIconName;
  label: string;
  color: string;
}>;

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPracticeWorkspace =
    pathname.startsWith("/listen/practice") ||
    pathname.startsWith("/read/practice") ||
    pathname.startsWith("/practice/session");

  if (isPracticeWorkspace) {
    return <>{children}</>;
  }

  return (
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
            <StudyStreakBadge className="hidden sm:inline-flex" />
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
      <PetFloatingWidget />
    </div>
  );
}
