"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import ScratchCanvas, { type ScratchCanvasHandle, type ScratchStroke } from "./ScratchCanvas";

export type ScratchPaperTab = "text" | "draw";

export interface ScratchPaperProps {
  /** Stable lesson/exam identifier. The host uses this to load the saved draft. */
  contextKey: string;
  text?: string;
  strokes?: ScratchStroke[];
  onTextChange?: (value: string) => void;
  onStrokesChange?: (value: ScratchStroke[]) => void;
  /** Controlled visibility is useful when the host wants to open the paper from a shortcut. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional custom label for the launcher (for instance, on an exam page). */
  triggerLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Optional selector for placing the launcher inside an existing toolbar. */
  launcherSelector?: string;
  children?: ReactNode;
}

const buttonClass =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-ink transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-ink disabled:cursor-not-allowed disabled:opacity-45";

/**
 * A small non-modal scratch paper that can stay open while audio, questions, or
 * an exam timer continue running. The host owns persistence; this component is
 * deliberately just a presentational editor with controlled values.
 */
export default function ScratchPaper({
  contextKey,
  text: textValue,
  strokes: strokesValue,
  onTextChange,
  onStrokesChange,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  triggerLabel = "Giấy nháp",
  disabled = false,
  className,
  launcherSelector,
  children,
}: ScratchPaperProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<ScratchPaperTab>("text");
  const [drawingTool, setDrawingTool] = useState<"pen" | "eraser">("pen");
  const [penColor, setPenColor] = useState("#17212b");
  const [penWidth, setPenWidth] = useState(3);
  const [canUndoDrawing, setCanUndoDrawing] = useState(Boolean(strokesValue?.length));
  const [drawingNotice, setDrawingNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [launcherSlot, setLauncherSlot] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && launcherSelector ? document.querySelector<HTMLElement>(launcherSelector) : null,
  );
  const [internalText, setInternalText] = useState("");
  const [internalStrokes, setInternalStrokes] = useState<ScratchStroke[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<ScratchCanvasHandle>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!launcherSelector || typeof document === "undefined") return;
    const findSlot = () => setLauncherSlot(document.querySelector<HTMLElement>(launcherSelector));
    findSlot();
    // Practice headers mount alongside the app shell; observe once so the
    // trigger moves into the toolbar after a client navigation without a
    // second launcher being left behind.
    const observer = new MutationObserver(findSlot);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [launcherSelector]);

  const isOpen = controlledOpen ?? uncontrolledOpen;
  const text = textValue ?? internalText;
  const strokes = strokesValue ?? internalStrokes;

  // Keep the floating tool out of the way of confirmation dialogs and other
  // modal flows. Visibility is transient; the current draft and open state are
  // intentionally preserved while the modal is mounted.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const readModalState = () => setExternalModalOpen(Boolean(document.querySelector('[aria-modal="true"]')));
    readModalState();
    const observer = new MutationObserver(readModalState);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isOpen || minimized) return;
    const target = tab === "text" ? textRef.current : panelRef.current;
    target?.focus({ preventScroll: true });
  }, [isOpen, minimized, tab]);

  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    if (!next) {
      setMinimized(false);
      triggerRef.current?.focus({ preventScroll: true });
    }
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange]);

  const setText = useCallback((next: string) => {
    if (textValue === undefined) setInternalText(next);
    onTextChange?.(next);
  }, [onTextChange, textValue]);

  const setStrokes = useCallback((next: ScratchStroke[]) => {
    if (strokesValue === undefined) setInternalStrokes(next);
    onStrokesChange?.(next);
  }, [onStrokesChange, strokesValue]);

  const stopPanelEvent = useCallback((event: { stopPropagation: () => void }) => {
    // Lesson shortcuts (arrows, space, tab, etc.) live on document. Keeping
    // events inside the paper scoped prevents typing or drawing from answering
    // a question underneath it.
    event.stopPropagation();
  }, []);

  const handlePanelKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }, [setOpen]);

  const handleDrawingChange = useCallback((next: ScratchStroke[]) => setStrokes(next), [setStrokes]);

  const requestClear = useCallback(() => setConfirmClear(true), []);
  const cancelClear = useCallback(() => setConfirmClear(false), []);
  const clearDrawing = useCallback(() => {
    canvasRef.current?.clear();
    setConfirmClear(false);
  }, []);

  if (externalModalOpen) return null;

  const trigger = <button
      ref={triggerRef}
      type="button"
      className={`${buttonClass} ${launcherSlot ? "scratch-paper-toolbar-launcher" : "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[55] rounded-full border-teal-line bg-teal-soft px-4 shadow-lg shadow-slate-950/10"} ${className ?? ""}`}
      aria-haspopup="dialog"
      aria-expanded={isOpen && !minimized}
      onClick={() => { setMinimized(false); setOpen(true); }}
      onKeyDown={stopPanelEvent}
      onKeyUp={stopPanelEvent}
      disabled={disabled}
      title={triggerLabel}
    >
      <span aria-hidden="true">✎</span><span>{triggerLabel}</span>
    </button>;

  return <>
    {launcherSlot ? createPortal(trigger, launcherSlot) : trigger}

    {isOpen && !minimized && <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="scratch-paper-title"
      data-dictionary-ignore="true"
      data-scratch-paper="true"
      data-scratch-context={contextKey}
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[54] flex max-h-[min(42rem,calc(100dvh-6rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-slate-950/20 sm:inset-x-auto sm:bottom-20 sm:right-4 sm:w-[min(27rem,calc(100vw-2rem))]"
      onKeyDown={handlePanelKeyDown}
      onKeyUp={stopPanelEvent}
      onPointerDown={stopPanelEvent}
      onPointerUp={stopPanelEvent}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0"><h2 id="scratch-paper-title" className="truncate text-base font-extrabold text-ink">Giấy nháp</h2><p className="truncate text-xs text-muted">Tự lưu trên thiết bị</p></div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-teal-ink" aria-label="Thu nhỏ giấy nháp" title="Thu nhỏ" onClick={() => { setMinimized(true); triggerRef.current?.focus({ preventScroll: true }); }}>−</button>
          <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-teal-ink" aria-label="Đóng giấy nháp" title="Đóng" onClick={() => setOpen(false)}>×</button>
        </div>
      </header>
      <nav className="flex shrink-0 gap-2 border-b border-line px-4 py-2" aria-label="Loại giấy nháp">
        <button type="button" className={`${buttonClass} flex-1 ${tab === "text" ? "border-teal-line bg-teal-soft text-teal-ink" : ""}`} aria-pressed={tab === "text"} onClick={() => setTab("text")}>Gõ chữ</button>
        <button type="button" className={`${buttonClass} flex-1 ${tab === "draw" ? "border-teal-line bg-teal-soft text-teal-ink" : ""}`} aria-pressed={tab === "draw"} onClick={() => setTab("draw")}>Vẽ tay</button>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "text" ? <textarea
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ghi nhanh ý tưởng, từ mới hoặc đáp án…"
          aria-label="Nội dung giấy nháp"
          maxLength={100_000}
          readOnly={textValue !== undefined && !onTextChange}
          className="min-h-52 w-full resize-y rounded-xl border border-line bg-surface-soft p-3 text-sm leading-6 text-ink outline-none focus:border-teal-line focus:ring-2 focus:ring-teal-line/40"
          spellCheck
        /> : <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-line bg-white dark:bg-slate-50">
            <ScratchCanvas ref={canvasRef} strokes={strokes} onChange={handleDrawingChange} onUndoAvailabilityChange={setCanUndoDrawing} onLimit={setDrawingNotice} color={penColor} strokeWidth={penWidth} tool={drawingTool} eraserSize={24} showKeyboardHint={false} ariaLabel="Vùng vẽ giấy nháp" className="block h-56 w-full" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">Vẽ bằng chuột, bút hoặc chạm</p>
            <div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => canvasRef.current?.undo()} disabled={!canUndoDrawing}>Hoàn tác</button><button type="button" className={buttonClass} onClick={requestClear} disabled={!strokes.length}>Xóa nét</button></div>
          </div>
          {drawingNotice && <p role="status" className="text-xs text-terracotta">{drawingNotice}</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <div className="flex items-center gap-1.5" role="group" aria-label="Công cụ vẽ">
              <span>Công cụ:</span>
              <button type="button" aria-label="Bút" aria-pressed={drawingTool === "pen"} onClick={() => setDrawingTool("pen")} className={`${buttonClass} min-h-7 px-2 py-1 text-xs ${drawingTool === "pen" ? "border-teal-line bg-teal-soft text-teal-ink" : ""}`}>✎ Bút</button>
              <button type="button" aria-label="Cục tẩy" aria-pressed={drawingTool === "eraser"} onClick={() => setDrawingTool("eraser")} className={`${buttonClass} min-h-7 px-2 py-1 text-xs ${drawingTool === "eraser" ? "border-teal-line bg-teal-soft text-teal-ink" : ""}`}>⌫ Tẩy</button>
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Màu bút">
              <span>Màu:</span>
              {[{ color: "#17212b", label: "Đen" }, { color: "#dc4f54", label: "Đỏ" }, { color: "#2c78c5", label: "Xanh" }].map((option) => <button key={option.color} type="button" aria-label={`Màu ${option.label}`} aria-pressed={penColor === option.color} onClick={() => setPenColor(option.color)} className={`h-7 w-7 rounded-full border-2 border-surface shadow-sm focus-visible:outline-2 focus-visible:outline-teal-ink ${penColor === option.color ? "ring-2 ring-teal-ink ring-offset-1 ring-offset-surface" : ""}`} style={{ backgroundColor: option.color }} />)}
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Độ dày bút">
              <span>Nét:</span>
              {[{ width: 2, label: "Mảnh" }, { width: 3, label: "Vừa" }, { width: 6, label: "Đậm" }].map((option) => <button key={option.width} type="button" aria-label={`Nét ${option.label}`} aria-pressed={penWidth === option.width} onClick={() => setPenWidth(option.width)} className={`${buttonClass} min-h-7 px-2 py-1 text-xs ${penWidth === option.width ? "border-teal-line bg-teal-soft text-teal-ink" : ""}`}>{option.label}</button>)}
            </div>
          </div>
          {confirmClear && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="alert"><span>Xóa toàn bộ nét vẽ?</span><span className="flex gap-2"><button type="button" className={buttonClass} onClick={cancelClear}>Hủy</button><button type="button" className={`${buttonClass} border-amber-400 bg-amber-100`} onClick={clearDrawing}>Xóa</button></span></div>}
        </div>}
        {children}
      </div>
    </div>}
  </>;
}

