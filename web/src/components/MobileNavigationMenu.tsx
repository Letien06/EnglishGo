"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import NavIcon, { type NavIconName } from "./NavIcon";
import ThemeToggle from "./ThemeToggle";

const navItems = [
  { href: "/hub", icon: "home", label: "Trang chủ", color: "text-primary" },
  { href: "/listen", icon: "listen", label: "Nghe", color: "text-plum" },
  { href: "/read", icon: "read", label: "Đọc", color: "text-azure" },
  { href: "/vocab", icon: "vocab", label: "Từ vựng", color: "text-jade" },
  { href: "/practice", icon: "practice", label: "Đề thi", color: "text-terracotta" },
  { href: "/leaderboard", icon: "leaderboard", label: "Bảng xếp hạng", color: "text-primary" },
] as const satisfies ReadonlyArray<{ href: string; icon: NavIconName; label: string; color: string }>;

export default function MobileNavigationMenu({ inverted = false }: { inverted?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Mở điều hướng"
        aria-expanded={open}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border ${inverted ? "border-white/30 bg-white/10 text-white" : "border-line bg-surface-soft text-ink"}`}
      >
        <span className="flex flex-col gap-[5px]" aria-hidden="true">
          <span className="block h-0.5 w-5 rounded bg-current" />
          <span className="block h-0.5 w-5 rounded bg-current" />
          <span className="block h-0.5 w-5 rounded bg-current" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Điều hướng">
          <button type="button" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" aria-label="Đóng điều hướng" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 flex h-full w-[min(86vw,360px)] flex-col bg-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-widest text-primary">ENGLISHGO</p>
                <h2 className="mt-1 text-lg font-extrabold text-ink">Điều hướng</h2>
              </div>
              <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line text-xl text-ink" aria-label="Đóng" onClick={() => setOpen(false)}>×</button>
            </div>
            <nav className="mt-5 grid gap-2" aria-label="Điều hướng chính">
              {navItems.map((item) => {
                const active = item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-base font-extrabold ${active ? "bg-primary/10 text-primary" : "text-ink hover:bg-surface-soft"}`}>
                    <NavIcon name={item.icon} className={`h-5 w-5 ${item.color}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
              <Link href="/account" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-extrabold text-ink">Tài khoản</Link>
              <ThemeToggle className="h-11 w-11 border border-line bg-surface-soft text-ink" />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
