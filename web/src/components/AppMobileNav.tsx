"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/hub", shortLabel: "T", label: "Trang chủ" },
  { href: "/listen", shortLabel: "N", label: "Nghe" },
  { href: "/read", shortLabel: "Đ", label: "Đọc" },
  { href: "/vocab", shortLabel: "V", label: "Từ vựng" },
  { href: "/practice", shortLabel: "ĐT", label: "Đề thi" },
] as const;

export default function AppMobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-line bg-glass px-1 py-1.5 backdrop-blur-xl lg:hidden"
      aria-label="Điều hướng mobile"
    >
      {navItems.map((item) => {
        const isActive =
          item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-w-12 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
              isActive ? "text-primary" : "text-muted hover:text-ink2"
            }`}
          >
            <span className="text-base font-extrabold">{item.shortLabel}</span>
            <small>{item.label}</small>
          </Link>
        );
      })}
    </nav>
  );
}
