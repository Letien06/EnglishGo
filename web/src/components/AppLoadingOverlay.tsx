"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { hasVisited, routeKey } from "@/lib/nav/session-nav";

function labelForPath(pathname: string): string {
  if (pathname.startsWith("/listen")) return "phần Nghe";
  if (pathname.startsWith("/read")) return "phần Đọc";
  if (pathname.startsWith("/vocab")) return "phần Từ vựng";
  if (pathname.startsWith("/account")) return "Tài khoản";
  return "nội dung học";
}

/**
 * Route-level loading overlay (rendered by `(app)/loading.tsx`).
 *
 * Next.js mounts this on EVERY Server Component navigation inside the (app)
 * group, so without any guard it flashes even when the destination is already
 * cached this session (e.g. returning to /listen, or re-opening a practice you
 * already did). That made the app feel like it "reloads from scratch" every
 * time.
 *
 * Fixes:
 *  1. If the destination route was already visited this session, do NOT show the
 *     overlay at all — the data comes back instantly from the client cache.
 *  2. Otherwise, wait a short grace period before showing, so genuinely fast
 *     navigations don't flash the overlay either. It only appears for real,
 *     first-time-this-session loads that take longer than the grace period.
 */
const GRACE_MS = 200;

export default function AppLoadingOverlay() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Read query params from the URL directly (client-only) instead of
    // useSearchParams() — the latter forces a CSR bailout that breaks
    // prerendering of the practice pages.
    const search = new URLSearchParams(window.location.search);
    const key = routeKey(pathname, search);
    // Already seen this destination this session — never flash the overlay.
    if (hasVisited(key)) {
      const hideTimer = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(hideTimer);
    }
    // First time this session: only reveal if loading actually takes a while.
    const timer = window.setTimeout(() => setVisible(true), GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!visible) return null;

  const label = labelForPath(pathname);

  return (
    <div className="app-busy-overlay">
      <div className="app-busy-card">
        <span className="app-busy-spinner" />
        <div>
          <p className="app-busy-title">
            Đang mở {label}
          </p>
          <p className="app-busy-description">
            Đang tải dữ liệu luyện tập...
          </p>
        </div>
      </div>
    </div>
  );
}
