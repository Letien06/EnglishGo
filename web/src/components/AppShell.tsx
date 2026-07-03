"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/listen", icon: "♫", label: "Nghe", color: "text-plum" },
  { href: "/read", icon: "▥", label: "Đọc", color: "text-azure" },
  { href: "/vocab", icon: "A", label: "Từ vựng", color: "text-jade" },
  { href: "/practice", icon: "▧", label: "Đề thi (demo)", color: "text-terracotta" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const isPracticeWorkspace =
    pathname.startsWith("/listen/practice") || pathname.startsWith("/read/practice");

  useEffect(() => {
    setPendingLabel(null);
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
            <span className="hidden h-9 items-center rounded-xl bg-primary/10 px-3 text-sm font-extrabold text-primary sm:inline-flex">
              ♟ 1
            </span>
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
    <div className="fixed right-5 top-20 z-[80] w-[300px] rounded-2xl border border-primary/25 bg-white/95 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 shrink-0 animate-spin rounded-full border-4 border-[#23c58b] border-r-[#ff4e9d] border-t-[#2879ff]" />
        <div>
          <p className="bg-gradient-to-r from-[#ef4da0] to-[#3177ff] bg-clip-text text-sm font-extrabold text-transparent">
            {title}
          </p>
          <p className="text-xs font-bold text-slate-500">
            Đang tải dữ liệu luyện tập...
          </p>
        </div>
      </div>
    </div>
  );
}
