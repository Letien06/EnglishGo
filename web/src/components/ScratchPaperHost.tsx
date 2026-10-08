"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScratchPaper from "./ScratchPaper";
import {
  clearScratchPaper, loadScratchPaper, saveScratchPaper,
  type ScratchPaperContext, type ScratchPaperDraft,
} from "@/lib/scratch-paper";

type ScratchPaperHostProps = { uid: string | null; ready: boolean };
const emptyDraft: ScratchPaperDraft = { text: "", strokes: [] };

function StoredPaper({ uid, context }: { uid: string; context: ScratchPaperContext }) {
  const [initial] = useState(() => loadScratchPaper(uid, context));
  const [draft, setDraft] = useState<ScratchPaperDraft>(initial.state);
  const [notice, setNotice] = useState({ status: initial.status as string, message: initial.message });
  const [confirmClear, setConfirmClear] = useState(false);
  const snapshot = useRef<ScratchPaperDraft>(initial.state);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelTimer = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  const persist = useCallback((report = true) => {
    cancelTimer();
    if (!dirty.current) return;
    const result = saveScratchPaper(uid, context, snapshot.current);
    if (result.status === "saved") dirty.current = false;
    if (report) setNotice(result);
  }, [cancelTimer, context, uid]);

  useEffect(() => {
    const flush = () => persist(false);
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      // This keyed component owns its UID/context snapshot. Navigation flushes
      // to the old paper even when the new resource mounts immediately.
      flush();
    };
  }, [persist]);

  const updateDraft = useCallback((next: ScratchPaperDraft) => {
    snapshot.current = next;
    dirty.current = true;
    setDraft(next);
    cancelTimer();
    if (notice.status !== "corrupt") setNotice({ status: "pending", message: "Đang tự lưu…" });
    saveTimer.current = setTimeout(() => persist(), 350);
  }, [cancelTimer, notice.status, persist]);

  const clearPaper = () => {
    cancelTimer();
    const result = clearScratchPaper(uid, context);
    setConfirmClear(false);
    if (result.status === "cleared" || result.status === "missing") {
      dirty.current = false;
      snapshot.current = emptyDraft;
      setDraft(emptyDraft);
      setNotice({ status: "ready", message: result.message });
    } else setNotice(result);
  };

  const storageFailed = ["corrupt", "unavailable", "invalid"].includes(notice.status);
  return <ScratchPaper
    contextKey={`${context.surface}:${context.resourceId}`}
    text={draft.text}
    strokes={draft.strokes}
    onTextChange={(text) => updateDraft({ ...snapshot.current, text })}
    onStrokesChange={(strokes) => updateDraft({ ...snapshot.current, strokes })}
    onOpenChange={(open) => { if (!open) persist(); }}
  >
    <div className="mt-3 space-y-2 text-xs text-muted" data-dictionary-ignore>
      <p role="status" aria-live="polite" className={storageFailed ? "text-terracotta" : ""}>{notice.message}</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {storageFailed && notice.status !== "corrupt" && <button type="button" className="min-h-9 rounded-lg border border-line px-3 font-bold text-ink" onClick={() => { dirty.current = true; persist(); }}>Thử lưu lại</button>}
        {(notice.status === "corrupt" || draft.text || draft.strokes.length > 0) && !confirmClear && <button type="button" className="min-h-9 rounded-lg px-3 font-bold text-teal-ink hover:bg-teal-soft focus-visible:outline-2 focus-visible:outline-teal-ink" onClick={() => setConfirmClear(true)}>Xóa giấy nháp</button>}
      </div>
      {confirmClear && <div className="rounded-xl border border-line bg-surface-soft p-3">
        <p>Xóa toàn bộ chữ và nét vẽ của bài này?</p>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="min-h-9 rounded-lg border border-line px-3 font-bold" onClick={() => setConfirmClear(false)}>Giữ lại</button>
          <button type="button" className="min-h-9 rounded-lg bg-terracotta/10 px-3 font-bold text-terracotta" onClick={clearPaper}>Xóa toàn bộ</button>
        </div>
      </div>}
    </div>
  </ScratchPaper>;
}

/** No database requests: the app's existing verified identity scopes storage. */
export default function ScratchPaperHost({ uid, ready }: ScratchPaperHostProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const part = searchParams.get("part");
  const testId = searchParams.get("testId");
  const level = searchParams.get("level");
  // Exam full/part sessions keep separate papers. Practice display modes and
  // q are excluded so flipping a question keeps the current paper.
  const examMode = pathname.startsWith("/practice/session/") ? searchParams.get("mode") : null;
  const examParts = pathname.startsWith("/practice/session/") ? searchParams.get("parts") : null;
  const examTime = pathname.startsWith("/practice/session/") ? searchParams.get("time") : null;
  const context = useMemo<ScratchPaperContext | null>(() => {
    const surface = /^\/listen(?:\/|$)/.test(pathname) ? "listen"
      : /^\/read(?:\/|$)/.test(pathname) ? "read"
      : /^\/practice(?:\/|$)/.test(pathname) ? "exam" : null;
    if (!surface) return null;
    const values = { part, testId, level, mode: examMode, parts: examParts, time: examTime };
    const resourceId = [pathname, ...Object.entries(values).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`)].join("|");
    return { surface, resourceId };
  }, [examMode, examParts, examTime, level, part, pathname, testId]);

  if (!uid || !ready || !context) return null;
  return <StoredPaper key={`${uid}:${context.surface}:${context.resourceId}`} uid={uid} context={context} />;
}
