"use client";

import Link from "next/link";
import LogoutButton from "./LogoutButton";

interface AppTopbarProps {
  pageTitle: string;
  pageSubtitle?: string;
  userName?: string | null;
  userEmail?: string | null;
}

export default function AppTopbar({
  pageTitle,
  pageSubtitle,
  userName,
  userEmail,
}: AppTopbarProps) {
  const displayLabel = userName || userEmail || "Tài khoản";

  return (
    <header className="app-shell-header sticky top-0 z-40 flex items-center justify-between gap-4 border-b bg-glass/90 px-5 py-3 backdrop-blur-xl lg:px-8">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-0.5">
          Không gian học tập
        </p>
        <h1 className="text-lg font-bold text-ink truncate">{pageTitle}</h1>
        {pageSubtitle && (
          <p className="text-sm text-muted truncate">{pageSubtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/account?tab=profile"
          className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-full bg-surface-soft text-sm font-semibold text-ink2 hover:text-ink transition-colors truncate max-w-[160px]"
          aria-label="Hồ sơ tài khoản"
        >
          {displayLabel}
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
