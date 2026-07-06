"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SHOW_DELAY_MS = 180;
const MIN_VISIBLE_MS = 420;
const MAX_VISIBLE_MS = 9000;

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

  useEffect(() => {
    function clearTimers() {
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
      showTimerRef.current = null;
      hideTimerRef.current = null;
      maxTimerRef.current = null;
    }

    function finish() {
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      const elapsed = Date.now() - startedAtRef.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = window.setTimeout(() => setVisible(false), remaining);
    }

    function begin(nextLabel: string, maxMs = MAX_VISIBLE_MS) {
      clearTimers();
      setLabel(nextLabel);
      startedAtRef.current = Date.now();
      showTimerRef.current = window.setTimeout(() => {
        setVisible(true);
        startedAtRef.current = Date.now();
      }, SHOW_DELAY_MS);
      maxTimerRef.current = window.setTimeout(finish, maxMs);
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
        );
        return;
      }

      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (link && shouldTrackLink(link)) {
        begin(link.dataset.overdelay || labelForHref(link.href));
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
    window.addEventListener("pageshow", finish);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("pageshow", finish);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    if (!startedAtRef.current) return;
    const timer = window.setTimeout(() => setVisible(false), MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
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
