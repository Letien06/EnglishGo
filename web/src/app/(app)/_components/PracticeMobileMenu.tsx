"use client";

/**
 * Mobile controls for the practice pages (Listen/Read).
 *
 * On desktop the practice header shows the mode switcher, Auto toggle, timer
 * and assist selector inline. On small screens those controls overflow and the
 * mode switcher was hidden entirely (no way to change mode on a phone).
 *
 * This component renders a single hamburger button (visible only < lg) that
 * opens a slide-in panel containing all of those controls in a touch-friendly
 * vertical layout, so the header stays clean and everything is reachable.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import NavIcon, { type NavIconName } from "@/components/NavIcon";

export type PracticeMode = "normal" | "bilingual" | "fill" | "flip";

const navigationItems = [
  { href: "/hub", label: "Trang chủ", icon: "home" },
  { href: "/listen", label: "Nghe", icon: "listen" },
  { href: "/read", label: "Đọc", icon: "read" },
  { href: "/vocab", label: "Từ vựng", icon: "vocab" },
  { href: "/practice", label: "Đề thi", icon: "practice" },
  { href: "/leaderboard", label: "Bảng xếp hạng", icon: "leaderboard" },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: NavIconName }>;

interface Props {
  modes: Array<[PracticeMode, string, string]>;
  activeMode: string;
  auto: boolean;
  onToggleAuto: () => void;
  onModeChange?: (mode: PracticeMode) => void;
  onAssistChange?: (value: number) => void;
  assist: number;
  assistOptions: number[];
  elapsed: string;
  /** Build the href for switching to a given mode. */
  modeHref: (mode: PracticeMode) => string;
  /** Build the href for switching to a given assist percentage. */
  assistHref: (value: number) => string;
}

export default function PracticeMobileMenu({
  modes,
  activeMode,
  auto,
  onToggleAuto,
  onModeChange,
  onAssistChange,
  assist,
  assistOptions,
  elapsed,
  modeHref,
  assistHref,
}: Props) {
  const [open, setOpen] = useState(false);

  // Lock body scroll while the panel is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/30 bg-white/10 text-white"
        aria-label="Mở công cụ luyện tập"
        aria-expanded={open}
      >
        <span className="flex flex-col gap-[5px]">
          <span className="block h-0.5 w-5 rounded bg-white" />
          <span className="block h-0.5 w-5 rounded bg-white" />
          <span className="block h-0.5 w-5 rounded bg-white" />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />

          {/* Slide-in panel */}
          <div className="absolute right-0 top-0 flex h-full w-[85vw] max-w-sm flex-col gap-6 overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-ink">Menu & công cụ</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-lg font-bold text-ink"
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>

            <nav className="grid grid-cols-2 gap-2" aria-label="Điều hướng chính">
              {navigationItems.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-extrabold text-ink">
                  <NavIcon name={item.icon} className="h-4 w-4 text-primary" />
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Timer */}
            <div className="flex items-center justify-between rounded-xl bg-surface-soft px-4 py-3">
              <span className="text-sm font-bold text-muted">Thời gian</span>
              <span className="text-lg font-extrabold tabular-nums text-ink">{elapsed}</span>
            </div>

            {/* Mode switcher */}
            <div>
              <p className="mb-2 text-sm font-extrabold text-muted">Chế độ</p>
              <div className="grid grid-cols-2 gap-2">
                {modes.map(([key, icon, label]) => {
                  const className = `inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-extrabold ${
                    activeMode === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-slate-200 text-ink"
                  }`;
                  if (onModeChange) {
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          onModeChange(key);
                          setOpen(false);
                        }}
                        className={className}
                      >
                        <span>{icon}</span>
                        {label}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={key}
                      href={modeHref(key)}
                      onClick={() => setOpen(false)}
                      className={className}
                    >
                      <span>{icon}</span>
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Auto toggle */}
            <button
              type="button"
              onClick={() => {
                onToggleAuto();
              }}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-extrabold ${
                auto ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-ink"
              }`}
            >
              <span>Tự chuyển bài khi đúng</span>
              <span
                className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                  auto ? "bg-primary" : "bg-slate-300"
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white transition-transform ${
                    auto ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </span>
            </button>

            {assistOptions.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-extrabold text-muted">Tỉ lệ hỗ trợ</p>
                <div className="grid grid-cols-3 gap-2">
                  {assistOptions.map((value) => {
                    const className = `inline-flex items-center justify-center rounded-xl border px-3 py-3 text-sm font-extrabold ${
                      assist === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-200 text-ink"
                    }`;
                    if (onAssistChange) {
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            onAssistChange(value);
                            setOpen(false);
                          }}
                          className={className}
                        >
                          {value}%
                        </button>
                      );
                    }
                    return (
                      <Link
                        key={value}
                        href={assistHref(value)}
                        onClick={() => setOpen(false)}
                        className={className}
                      >
                        {value}%
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
