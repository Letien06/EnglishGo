"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "englishgo-theme";
const MANUAL_STORAGE_KEY = "englishgo-theme-manual";

function readTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const hasManualChoice = localStorage.getItem(MANUAL_STORAGE_KEY) === "1";
    if (hasManualChoice && (saved === "dark" || saved === "light")) return saved;
  } catch {
    /* ignore */
  }
  return "light";
}

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">(() => readTheme());

  const toggle = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.setItem(MANUAL_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setTheme(next);
  }, [theme]);

  const label =
    theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-lg transition-colors hover:bg-primary-soft ${className ?? ""}`}
      aria-label={label}
      aria-pressed={theme === "dark"}
      title={label}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
