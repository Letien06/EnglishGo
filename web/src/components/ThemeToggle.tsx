"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "englishgo-theme";
const MANUAL_STORAGE_KEY = "englishgo-theme-manual";
const THEME_CHANGED_EVENT = "englishgo:theme-changed";

function readTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  const current = document.documentElement.dataset.theme;
  if (current === "dark" || current === "light") return current;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const hasManualChoice = localStorage.getItem(MANUAL_STORAGE_KEY) === "1";
    if (hasManualChoice && (saved === "dark" || saved === "light")) return saved;
  } catch {
    /* ignore */
  }
  return "light";
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_CHANGED_EVENT, onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    window.removeEventListener(THEME_CHANGED_EVENT, onChange);
    observer.disconnect();
  };
}

const serverTheme = () => "light" as const;

export default function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  const toggle = useCallback(() => {
    const next = readTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
      localStorage.setItem(MANUAL_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
  }, []);

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
