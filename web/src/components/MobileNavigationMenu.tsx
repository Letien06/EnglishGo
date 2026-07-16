"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import NavIcon, { type NavIconName } from "./NavIcon";
import ThemeToggle from "./ThemeToggle";
import useDialogFocus from "./useDialogFocus";

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
] as const satisfies ReadonlyArray<{ href: string; icon: NavIconName; label: string; color: string }>;

export default function MobileNavigationMenu({ inverted = false }: { inverted?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialogFocus(open, () => setOpen(false), dialogRef);

  return (
    <div className="xl:hidden">
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

      {open && createPortal(
        <div ref={dialogRef} tabIndex={-1} className="mobile-navigation-dialog fixed inset-x-0 bottom-0 top-16 z-[1000] xl:hidden" role="dialog" aria-modal="true" aria-label="Điều hướng">
          <button type="button" className="mobile-navigation-backdrop absolute inset-0 bg-slate-950/30 backdrop-blur-sm" aria-label="Đóng điều hướng" onClick={() => setOpen(false)} />
          <aside className="mobile-navigation-sheet absolute inset-x-0 top-0 max-h-full overflow-y-auto border-t border-line bg-surface px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl">
            <div className="mx-auto max-w-lg">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <p className="text-xs font-extrabold uppercase tracking-widest text-primary">ENGLISHGO</p>
                <button type="button" data-dialog-initial-focus className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line text-xl text-ink" aria-label="Đóng" onClick={() => setOpen(false)}>×</button>
              </div>
              <nav className="mt-4 grid gap-2" aria-label="Điều hướng chính">
              {navItems.map((item) => {
                const active = item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`flex min-h-14 items-center gap-4 rounded-xl px-4 text-lg font-extrabold ${active ? "bg-primary/10 text-primary" : "text-ink hover:bg-surface-soft"}`}>
                    <NavIcon name={item.icon} className={`h-6 w-6 ${item.color}`} />
                    {item.label}
                  </Link>
                );
              })}
              </nav>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
                <Link href="/account" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-extrabold text-ink">Tài khoản</Link>
                <ThemeToggle className="h-11 w-11 border border-line bg-surface-soft text-ink" />
              </div>
            </div>
          </aside>
        </div>,
        document.body,
      )}
    </div>
  );
}
