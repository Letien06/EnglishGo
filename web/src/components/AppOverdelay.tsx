"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 180;
const MAX_VISIBLE_MS = 5000;
const READY_EVENT = "englishgo:overdelay-ready";
const BEGIN_EVENT = "englishgo:overdelay-begin";
const ACTIVE_ATTR = "data-overdelay-active";
const ROUTE_READY_KEY = "route-ready";

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function samePageHashLink(link: HTMLAnchorElement): boolean {
  const href = link.getAttribute("href") ?? "";
  return href.startsWith("#") && href.length > 1;
}

function shouldTrackLink(link: HTMLAnchorElement): boolean {
  if (link.target && link.target !== "_self") return false;
  if (link.hasAttribute("download")) return false;
  if (samePageHashLink(link)) return false;
  if (!link.href) return false;

  try {
    const target = new URL(link.href);
    if (target.origin !== window.location.origin) return false;
    return target.pathname + target.search !== window.location.pathname + window.location.search;
  } catch {
    return false;
  }
}

function labelForHref(href: string): string {
  try {
    const path = new URL(href).pathname;
    if (path.startsWith("/listen")) return "Đang mở phần Nghe...";
    if (path.startsWith("/read")) return "Đang mở phần Đọc...";
    if (path.startsWith("/vocab")) return "Đang mở phần Từ vựng...";
    if (path.startsWith("/practice")) return "Đang mở bài luyện...";
    if (path.startsWith("/leaderboard")) return "Đang mở bảng xếp hạng...";
    if (path.startsWith("/admin")) return "Đang mở trang quản trị...";
    return "Đang mở trang...";
  } catch {
    return "Đang mở trang...";
  }
}

export default function AppOverdelay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(
    () => `${pathname}?${searchParams.toString()}`,
    [pathname, searchParams],
  );
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("Đang tải...");
  const startedAtRef = useRef(0);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const waitForRef = useRef<string | null>(null);

  useEffect(() => {
    function clearTimers(clearWait = true) {
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
      showTimerRef.current = null;
      hideTimerRef.current = null;
      maxTimerRef.current = null;
      if (clearWait) waitForRef.current = null;
    }

    function finish(force = false) {
      if (waitForRef.current && !force) return;
      waitForRef.current = null;
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (maxTimerRef.current) {
        window.clearTimeout(maxTimerRef.current);
        maxTimerRef.current = null;
      }
      const elapsed = Date.now() - startedAtRef.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => {
        document.documentElement.removeAttribute(ACTIVE_ATTR);
        setVisible(false);
      }, remaining);
    }

    function begin(nextLabel: string, maxMs = MAX_VISIBLE_MS, waitFor: string | null = null) {
      clearTimers();
      document.documentElement.setAttribute(ACTIVE_ATTR, "true");
      waitForRef.current = waitFor;
      setLabel(nextLabel);
      startedAtRef.current = Date.now();
      showTimerRef.current = window.setTimeout(() => {
        setVisible(true);
        startedAtRef.current = Date.now();
      }, SHOW_DELAY_MS);
      maxTimerRef.current = window.setTimeout(() => finish(true), maxMs);
    }

    function handleReady(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail as { key?: unknown; force?: unknown } | undefined : undefined;
      if (detail?.force === true) {
        finish(true);
        return;
      }
      if (!waitForRef.current) return;
      const key = typeof detail?.key === "string" ? detail.key : "";
      if (!key || key === waitForRef.current) finish(true);
    }

    function handleBegin(event: Event) {
      const detail = event instanceof CustomEvent
        ? event.detail as { label?: unknown; timeout?: unknown; waitFor?: unknown } | undefined
        : undefined;
      const timeout = Number(detail?.timeout);
      begin(
        typeof detail?.label === "string" ? detail.label : "Đang xử lý...",
        Number.isFinite(timeout) && timeout > 0 ? timeout : MAX_VISIBLE_MS,
        typeof detail?.waitFor === "string" ? detail.waitFor : null,
      );
    }

    function handlePageShow() {
      finish();
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const manual = target.closest<HTMLElement>("[data-overdelay]");
      if (manual) {
        const timeout = Number(manual.dataset.overdelayTimeout);
        begin(
          manual.dataset.overdelay || "Đang xử lý...",
          Number.isFinite(timeout) && timeout > 0 ? timeout : 3500,
          manual.dataset.overdelayWaitFor || null,
        );
        return;
      }

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link && shouldTrackLink(link)) {
        begin(
          link.dataset.overdelay || labelForHref(link.href),
          MAX_VISIBLE_MS,
          link.dataset.overdelayWaitFor || ROUTE_READY_KEY,
        );
      }
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.hasAttribute("data-no-overdelay")) return;
      const timeout = Number(form.dataset.overdelayTimeout);
      begin(
        form.dataset.overdelay || "Đang xử lý...",
        Number.isFinite(timeout) && timeout > 0 ? timeout : 2500,
      );
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener(BEGIN_EVENT, handleBegin);
    window.addEventListener(READY_EVENT, handleReady);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener(BEGIN_EVENT, handleBegin);
      window.removeEventListener(READY_EVENT, handleReady);
      window.removeEventListener("pageshow", handlePageShow);
      clearTimers();
      document.documentElement.removeAttribute(ACTIVE_ATTR);
    };
  }, []);

  useEffect(() => {
    // A navigation has committed only after the new route tree has rendered.
    // Waiting for two frames ensures the destination gets a chance to paint
    // before the generic navigation overlay disappears.
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(READY_EVENT, {
          detail: { key: ROUTE_READY_KEY },
        }));
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [routeKey]);

  return (
    <div className={`overdelay-feedback ${visible ? "is-visible" : ""}`} aria-hidden="true">
      <div className="overdelay-progress" />
      <div className="overdelay-pill">
        <span className="overdelay-spinner" />
        <span>{label}</span>
      </div>
    </div>
  );
}
