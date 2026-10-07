"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import NavIcon, { type NavIconName } from "./NavIcon";
import useDialogFocus from "./useDialogFocus";

const navItems = [
  { href: "/hub", icon: "home", label: "Trang chủ", key: "hub", color: "text-primary" },
  { href: "/listen", icon: "listen", label: "Nghe", key: "listen", color: "text-plum" },
  { href: "/read", icon: "read", label: "Đọc", key: "read", color: "text-azure" },
  { href: "/writing", icon: "writing", label: "Viết", key: "writing", color: "text-terracotta" },
  { href: "/vocab", icon: "vocab", label: "Từ vựng", key: "vocab", color: "text-jade" },
  { href: "/practice", icon: "practice", label: "Đề thi", key: "practice", color: "text-terracotta" },
  { href: "/leaderboard", icon: "leaderboard", label: "Bảng xếp hạng", key: "leaderboard", color: "text-primary" },
] as const satisfies ReadonlyArray<{
  href: string;
  icon: NavIconName;
  label: string;
  key: string;
  color: string;
}>;

interface PublicHeaderProps {
  user?: { displayName: string } | null;
}

type SessionUser = { displayName: string };

export default function PublicHeader({ user }: PublicHeaderProps) {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuDialogRef = useRef<HTMLElement>(null);

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

  useDialogFocus(menuOpen, () => setMenuOpen(false), menuDialogRef);

  return (
    <header className="public-header sticky top-0 z-50 border-b border-line bg-glass/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="public-brand flex items-center gap-3 no-underline">
          <span className="public-brand-mark inline-flex h-12 w-12 items-center justify-center rounded-xl text-xl font-extrabold text-primary">
            E
          </span>
          <strong className="hidden text-2xl font-extrabold tracking-tight text-ink sm:block">
            ENGLISHGO
          </strong>
        </Link>

        <nav className="public-nav hidden items-center gap-1 lg:flex" aria-label="Điều hướng chính">
          {navItems.map((item) => {
            const isActive =
              item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`public-nav-link flex items-center gap-2 text-sm font-extrabold ${
                  isActive ? "is-active text-primary" : "text-ink3 hover:text-ink"
                }`}
              >
                <NavIcon name={item.icon} className={`h-4 w-4 ${item.color}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="public-header-control inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface-soft text-ink lg:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            <span className="flex flex-col gap-[5px]">
              <span className="block h-0.5 w-6 rounded bg-current" />
              <span className="block h-0.5 w-6 rounded bg-current" />
              <span className="block h-0.5 w-6 rounded bg-current" />
            </span>
          </button>
          <ThemeToggle className="public-header-control !hidden h-12 w-12 border border-line bg-surface-soft text-ink sm:!inline-flex" />
          {sessionUser ? (
            <Link
              href="/account"
              className="public-avatar inline-flex h-12 min-w-12 items-center justify-center rounded-full bg-primary px-4 text-sm font-extrabold text-gold-ink"
              aria-label="Tài khoản"
            >
              {(sessionUser.displayName || "E").charAt(0).toUpperCase()}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="public-login hidden text-base font-extrabold text-ink sm:inline-flex"
              >
                Đăng nhập
              </Link>
              <Link
                href="/login?mode=register"
                className="public-register inline-flex h-12 items-center rounded-xl bg-primary px-6 text-base font-extrabold text-gold-ink"
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
            ref={menuDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
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
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-lg font-extrabold transition-colors ${
                        isActive ? "bg-primary/10 text-primary" : "text-ink hover:bg-surface-soft"
                      }`}
                    >
                      <NavIcon name={item.icon} className={`h-5 w-5 ${item.color}`} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
              <span className="text-sm font-extrabold text-ink">Giao diện</span>
              <ThemeToggle className="h-11 w-11 border border-line bg-surface-soft text-ink" />
            </div>

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
