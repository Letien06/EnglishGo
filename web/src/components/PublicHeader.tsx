"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/listen", icon: "♪", label: "Nghe", key: "listen", color: "text-plum" },
  { href: "/read", icon: "▥", label: "Đọc", key: "read", color: "text-azure" },
  { href: "/vocab", icon: "A", label: "Từ vựng", key: "vocab", color: "text-jade" },
  { href: "/practice", icon: "▧", label: "Đề thi (demo)", key: "practice", color: "text-terracotta" },
] as const;

interface PublicHeaderProps {
  user?: { displayName: string; streakDays: number } | null;
}

export default function PublicHeader({ user }: PublicHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-glass backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-xl font-extrabold text-primary">
            E
          </span>
          <strong className="text-2xl font-extrabold tracking-tight text-ink">
            ENGLISHGO
          </strong>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex items-center gap-2 text-base font-extrabold transition-colors ${
                  isActive ? "text-primary" : "text-ink3 hover:text-ink"
                }`}
              >
                <span className={item.color}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle className="h-12 w-12 border border-line bg-surface-soft text-ink" />
          {user ? (
            <Link
              href="/account"
              className="inline-flex h-12 min-w-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-extrabold text-gold-ink shadow-[0_12px_28px_rgba(224,149,43,0.25)]"
              aria-label="Tài khoản"
            >
              {(user.displayName || "E").charAt(0).toUpperCase()}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-base font-extrabold text-ink transition-colors hover:text-primary sm:inline-flex"
              >
                Đăng nhập
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-base font-extrabold text-gold-ink shadow-[0_12px_28px_rgba(224,149,43,0.22)] transition-opacity hover:opacity-90"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
