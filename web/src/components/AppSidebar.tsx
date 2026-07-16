"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/progress", shortLabel: "TB", label: "Tiến bộ" },
  { href: "/pet", shortLabel: "M", label: "Thú cưng" },
  { href: "/hub", shortLabel: "T", label: "Trang chủ" },
  { href: "/listen", shortLabel: "N", label: "Nghe" },
  { href: "/read", shortLabel: "Đ", label: "Đọc" },
  { href: "/vocab", shortLabel: "V", label: "Từ vựng" },
  { href: "/practice", shortLabel: "ĐT", label: "Luyện đề" },
  { href: "/community", shortLabel: "C", label: "Cộng đồng" },
] as const;

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-5 py-4 no-underline">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-extrabold text-gold-ink">
          E
        </span>
        <span className="flex flex-col leading-tight">
          <strong className="text-sm font-extrabold tracking-tight text-ink">ENGLISHGO</strong>
          <small className="text-[11px] text-muted">Luyện TOEIC miễn phí</small>
        </span>
      </Link>

      <nav className="mt-2 flex flex-1 flex-col gap-0.5 px-3" aria-label="Điều hướng chính">
        {navItems.map((item) => {
          const isActive =
            item.href === "/hub" ? pathname === "/hub" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-primary-soft text-primary"
                  : "text-ink2 hover:bg-surface-soft hover:text-ink"
              }`}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-surface-soft text-xs font-extrabold">
                {item.shortLabel}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 mb-4 mt-auto rounded-lg bg-surface-soft p-3 text-[11px] leading-relaxed text-muted">
        <strong className="mb-1 block text-ink3">Nội dung miễn phí</strong>
        Bài luyện được tải từ API học TOEIC công khai và tài nguyên cộng đồng.
      </div>
    </aside>
  );
}
