"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/hub", icon: "T", label: "Trang chủ", key: "hub", color: "text-primary" },
  { href: "/listen", icon: "N", label: "Nghe", key: "listen", color: "text-plum" },
  { href: "/read", icon: "Đ", label: "Đọc", key: "read", color: "text-azure" },
  { href: "/vocab", icon: "V", label: "Từ vựng", key: "vocab", color: "text-jade" },
  { href: "/practice", icon: "ĐT", label: "Đề thi", key: "practice", color: "text-terracotta" },
  { href: "/leaderboard", icon: "BXH", label: "Bảng xếp hạng", key: "leaderboard", color: "text-primary" },
] as const;

interface PublicHeaderProps {
  user?: { displayName: string } | null;
}

type SessionUser = { displayName: string };

export default function PublicHeader({ user }: PublicHeaderProps) {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(user);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const result = await response.json();
        if (result?.success) {
          setSessionUser(result.data ? { displayName: result.data.displayName } : null);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    void loadSession();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setMenuOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

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

        <nav className="hidden items-center gap-5 lg:flex" aria-label="Điều hướng chính">
          {navItems.map((item) => {
            const isActive =
              item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex items-center gap-2 text-sm font-extrabold transition-colors ${
                  isActive ? "text-primary" : "text-ink3 hover:text-ink"
                }`}
              >
                <span className={item.color}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-soft text-ink lg:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <span className="flex flex-col gap-[5px]">
              <span className="block h-0.5 w-6 rounded bg-current" />
              <span className="block h-0.5 w-6 rounded bg-current" />
              <span className="block h-0.5 w-6 rounded bg-current" />
            </span>
          </button>
          <ThemeToggle className="h-12 w-12 border border-line bg-surface-soft text-ink" />
          {sessionUser ? (
            <Link
              href="/account"
              className="inline-flex h-12 min-w-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-extrabold text-gold-ink shadow-[0_12px_28px_rgba(224,149,43,0.25)]"
              aria-label="Tài khoản"
            >
              {(sessionUser.displayName || "E").charAt(0).toUpperCase()}
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
                href="/login?mode=register"
                className="inline-flex h-12 items-center rounded-xl bg-primary px-6 text-base font-extrabold text-gold-ink shadow-[0_12px_28px_rgba(224,149,43,0.22)] transition-opacity hover:opacity-90"
              >
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-20 z-40 bg-slate-900/40 backdrop-blur-sm"
          />
          <nav
            className="absolute inset-x-0 top-20 z-50 border-b border-line bg-surface px-5 pb-6 pt-2 shadow-xl"
            aria-label="Điều hướng mobile"
          >
            <ul className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-lg font-extrabold transition-colors ${
                        isActive ? "bg-primary/10 text-primary" : "text-ink hover:bg-surface-soft"
                      }`}
                    >
                      <span className={`text-xl ${item.color}`}>{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {!sessionUser && (
              <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center rounded-xl border border-line px-4 py-3 text-base font-extrabold text-ink"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/login?mode=register"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-base font-extrabold text-gold-ink"
                >
                  Đăng ký
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
