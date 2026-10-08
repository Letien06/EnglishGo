"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScratchPaper from "./ScratchPaper";
import {
  clearScratchPaper,
  loadScratchPaper,
  saveScratchPaper,
  type ScratchPaperContext,
  type ScratchPaperDraft,
  type ScratchPaperReadStatus,
  type ScratchStroke,
} from "@/lib/scratch-paper";

type ScratchPaperHostProps = {
  uid: string | null;
  ready: boolean;
};

type ScratchStatus = ScratchPaperReadStatus | "loading" | "saved";

function surfaceForPath(pathname: string): ScratchPaperContext["surface"] | null {
  if (pathname.startsWith("/listen")) return "listen";
  if (pathname.startsWith("/read")) return "read";
  if (pathname.startsWith("/practice")) return "exam";
  return null;
}

function resourceForPath(pathname: string, values: { part: string | null; testId: string | null; level: string | null }): string {
  const stableParts = [pathname];
  for (const key of ["part", "testId", "level"]) {
    const value = values[key as keyof typeof values];
    if (value) stableParts.push(`${key}=${value}`);
  }
  return stableParts.join("|");
}

function displayContext(surface: ScratchPaperContext["surface"], resourceId: string): string {
  const title = surface === "listen" ? "Nghe" : surface === "read" ? "Đọc" : "Đề thi";
  const part = resourceId.match(/(?:^|\|)part=([^|]+)/)?.[1];
  const testId = resourceId.match(/(?:^|\|)testId=([^|]+)/)?.[1];
  const level = resourceId.match(/(?:^|\|)level=([^|]+)/)?.[1];
  const detail = part ? `Part ${part}` : testId ? `Đề ${testId}` : level ? `Mức ${level}` : "bài đang mở";
  return `${title} · ${detail}`;
}

const emptyDraft: ScratchPaperDraft = { text: "", strokes: [] };

/**
 * Bridges route identity to the device-local paper. It intentionally has no
 * Firestore dependency: opening or typing in the paper must not add a network
 * request to a lesson or change an exam's answer draft.
 */
export default function ScratchPaperHost({ uid, ready }: ScratchPaperHostProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const part = searchParams.get("part");
  const testId = searchParams.get("testId");
  const level = searchParams.get("level");
  const context = useMemo(() => {
    const surface = surfaceForPath(pathname);
    if (!surface) return null;
    const resourceId = resourceForPath(pathname, { part, testId, level });
    return { surface, resourceId, label: displayContext(surface, resourceId) };
  }, [level, part, pathname, testId]);
  const contextKey = context ? `${context.surface}:${context.resourceId}` : null;
  const [draft, setDraft] = useState<ScratchPaperDraft>(emptyDraft);
  const draftRef = useRef<ScratchPaperDraft>(emptyDraft);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<ScratchStatus>("loading");
  const [message, setMessage] = useState("");
  const saveTimerRef = useRef<number | null>(null);
  const activeRef = useRef<{ uid: string; context: ScratchPaperContext; contextKey: string; draft: ScratchPaperDraft } | null>(null);

  useEffect(() => {
    draftRef.current = draft;
    if (activeRef.current) activeRef.current.draft = draft;
  }, [draft]);

  useEffect(() => {
    if (!uid || !ready || !context || !contextKey) return;
    const previous = activeRef.current;
    if (previous && (previous.uid !== uid || previous.contextKey !== contextKey)) {
      saveScratchPaper(previous.uid, previous.context, previous.draft);
    }
    const timer = window.setTimeout(() => {
      setLoadedKey(null);
      setStatus("loading");
      const result = loadScratchPaper(uid, context);
      setDraft(result.state);
      draftRef.current = result.state;
      activeRef.current = { uid, context, contextKey, draft: result.state };
      setLoadedKey(contextKey);
      setStatus(result.status);
      setMessage(result.message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context, contextKey, ready, uid]);

  const persist = useCallback(() => {
    if (!uid || !ready || !context || !contextKey || loadedKey !== contextKey) return;
    const result = saveScratchPaper(uid, context, draftRef.current);
    setStatus(result.status === "saved" ? "saved" : result.status);
    setMessage(result.message);
  }, [context, contextKey, loadedKey, ready, uid]);

  useEffect(() => {
    if (!uid || !ready || !context || !contextKey || loadedKey !== contextKey) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      persist();
    }, 350);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [draft, context, contextKey, loadedKey, persist, ready, uid]);

  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const active = activeRef.current;
      if (active) {
        const result = saveScratchPaper(active.uid, active.context, active.draft);
        setStatus(result.status === "saved" ? "saved" : result.status);
        setMessage(result.message);
      } else persist();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  const updateDraft = useCallback((next: ScratchPaperDraft) => {
    draftRef.current = next;
    if (activeRef.current) activeRef.current.draft = next;
    setDraft(next);
  }, []);

  const clearPaper = useCallback(() => {
    if (!uid || !context) return;
    const result = clearScratchPaper(uid, context);
    setDraft(emptyDraft);
    draftRef.current = emptyDraft;
    if (activeRef.current) activeRef.current.draft = emptyDraft;
    setStatus(result.status === "cleared" || result.status === "missing" ? "ready" : result.status);
    setMessage(result.message);
  }, [context, uid]);

  if (!context || !uid || !ready || !contextKey) return null;

  return <ScratchPaper
    contextKey={context.label}
    text={draft.text}
    strokes={draft.strokes as ScratchStroke[]}
    onTextChange={(text) => updateDraft({ ...draftRef.current, text })}
    onStrokesChange={(strokes) => updateDraft({ ...draftRef.current, strokes })}
  >
    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted" data-dictionary-ignore>
      <p role="status" aria-live="polite" className="min-w-0 truncate">{status === "loading" ? "Đang mở giấy nháp…" : message || (status === "saved" ? "Đã tự lưu trên thiết bị." : "")}</p>
      {(status === "corrupt" || draft.text || draft.strokes.length > 0) && <button type="button" className="shrink-0 rounded-lg px-2 py-1 font-bold text-teal-ink hover:bg-teal-soft focus-visible:outline-2 focus-visible:outline-teal-ink" onClick={clearPaper}>Xóa giấy nháp</button>}
    </div>
  </ScratchPaper>;
}

