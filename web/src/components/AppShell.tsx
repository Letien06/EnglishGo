"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import StudyStreakBadge from "./StudyStreakBadge";

const navItems = [
  { href: "/listen", icon: "♫", label: "Nghe", color: "text-plum" },
  { href: "/read", icon: "▥", label: "Đọc", color: "text-azure" },
  { href: "/vocab", icon: "A", label: "Từ vựng", color: "text-jade" },
  { href: "/practice", icon: "▧", label: "Đề thi", color: "text-terracotta" },
  { href: "/leaderboard", icon: "🏆", label: "Bảng xếp hạng", color: "text-primary" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const isPracticeWorkspace =
    pathname.startsWith("/listen/practice") ||
    pathname.startsWith("/read/practice") ||
    pathname.startsWith("/practice/session");

  useEffect(() => {
    const timer = window.setTimeout(() => setPendingLabel(null), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (isPracticeWorkspace) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-dvh bg-[#f1f5fb] text-ink">
      <header className="sticky top-0 z-50 border-b border-line bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-base font-extrabold text-primary">
              E
            </span>
            <strong className="text-xl font-extrabold tracking-tight text-ink">
              ENGLISHGO
            </strong>
          </Link>

          <nav className="hidden items-center gap-3 md:flex" aria-label="Learning navigation">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setPendingLabel(item.label.replace(" (demo)", ""))}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-extrabold transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-ink3 hover:bg-surface-soft hover:text-ink"
                  }`}
                >
                  <span className={item.color}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <StudyStreakBadge className="hidden sm:inline-flex" />
            <ThemeToggle className="border border-line bg-surface-soft text-ink" />
            <Link
              href="/account"
              className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 text-base font-extrabold ${
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

      {pendingLabel && <SmallLoadingNotice title={`Đang mở phần ${pendingLabel}`} />}
      {children}
    </div>
  );
}

function SmallLoadingNotice({ title }: { title: string }) {
  return (
    <div className="app-busy-notice">
      <div className="app-busy-card">
        <span className="app-busy-spinner" />
        <div>
          <p className="app-busy-title">
            {title}
          </p>
          <p className="app-busy-description">
            Đang tải dữ liệu luyện tập...
          </p>
        </div>
      </div>
    </div>
  );
}
