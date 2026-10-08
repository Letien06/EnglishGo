"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import AnnotationPencilIcon from "./AnnotationPencilIcon";
import AnnotationEraserIcon from "./AnnotationEraserIcon";
import { eraseScratchStrokes } from "./ScratchCanvas";
import { loadQuestionAnnotations, type QuestionAnnotationContext } from "@/lib/question-annotations";
import { clearWorkspaceAnnotations, loadWorkspaceAnnotations, saveWorkspaceAnnotations, validWorkspaceAnnotations, type WorkspaceAnnotationState, type WorkspacePoint, type WorkspaceStroke } from "@/lib/workspace-annotations";

type Rect = { x: number; y: number; width: number; height: number };
type Layout = { width: number; height: number; anchors: Map<string, Rect> };
type Gesture = { pointer: number; layout: Layout; anchor: string; origin: Rect; stroke: WorkspaceStroke | null; previous: WorkspacePoint; erased: WorkspaceStroke[]; changed: boolean };
type Props = { uid: string | null; context: QuestionAnnotationContext; legacyContexts?: QuestionAnnotationContext[]; disabled?: boolean; className?: string; children: ReactNode };

const emptyLayout = (): Layout => ({ width: 0, height: 0, anchors: new Map() });
const emptyState = (): WorkspaceAnnotationState => ({ strokes: [], legacyImported: false });
const buttonClass = "inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-ink hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-teal-ink disabled:opacity-40";
const sameWidth = (a: number, b: number) => Math.abs(a - b) <= 2;
const id = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** An anchor follows its content when translations or preceding answers expand. */
export function WorkspaceAnnotationAnchor({ target, children, className = "" }: { target: string; children: ReactNode; className?: string }) {
  return <div data-annotation-anchor={target} className={className}>{children}</div>;
}

function path(points: WorkspacePoint[]) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
}

function closestAnchor(layout: Layout, point: WorkspacePoint): [string, Rect] {
  const entries = [...layout.anchors.entries()];
  const containing = entries.filter(([, rect]) => point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height);
  if (containing.length) return containing.sort((a, b) => a[1].width * a[1].height - b[1].width * b[1].height)[0];
  // Whitespace has an anchor too; prefer the nearby content over the page origin.
  const distance = (rect: Rect) => Math.hypot(Math.max(rect.x - point.x, 0, point.x - rect.x - rect.width), Math.max(rect.y - point.y, 0, point.y - rect.y - rect.height));
  return entries.sort((a, b) => distance(a[1]) - distance(b[1]))[0] ?? ["workspace", { x: 0, y: 0, width: layout.width, height: layout.height }];
}

function StoredWorkspace({ uid, context, legacyContexts = [], disabled = false, className = "", children }: Props) {
  const owner = uid ?? "guest";
  const root = useRef<HTMLDivElement>(null);
  const overlay = useRef<SVGSVGElement>(null);
  const layoutRef = useRef<Layout>(emptyLayout());
  const stateRef = useRef<WorkspaceAnnotationState>(emptyState());
  const gesture = useRef<Gesture | null>(null);
  const history = useRef<WorkspaceStroke[][]>([]);
  const frame = useRef<number | null>(null);
  const ready = useRef(false);
  const [layout, setLayout] = useState<Layout>(emptyLayout);
  const [state, setState] = useState<WorkspaceAnnotationState>(emptyState);
  const [preview, setPreview] = useState<WorkspaceStroke[] | null>(null);
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser" | "move">("pen");
  const [notice, setNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [launcher, setLauncher] = useState<HTMLElement | null>(null);
  const drawing = active && !disabled && tool !== "move";
  const legacyRef = useRef(legacyContexts);

  const cancel = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (frame.current !== null) { window.cancelAnimationFrame(frame.current); frame.current = null; }
    if (current) { try { root.current?.releasePointerCapture(current.pointer); } catch { /* already released */ } }
    setPreview(null);
  }, []);

  const persist = useCallback((next: WorkspaceAnnotationState) => {
    if (!validWorkspaceAnnotations(next)) { setNotice("Chú thích đã đầy. Hãy tẩy hoặc xóa bớt nét."); return false; }
    const result = saveWorkspaceAnnotations(owner, context, next);
    if (result.status === "invalid") { setNotice(result.message); return false; }
    stateRef.current = next;
    setState(next);
    setNotice(result.status === "saved" ? "" : `${result.message} Nét hiện tại vẫn được giữ trong trang này.`);
    // Keep the in-memory draft usable when localStorage is unavailable or a
    // previous corrupt payload prevents replacement; retry can save it later.
    return true;
  }, [context, owner]);

  const measure = useCallback(() => {
    const element = root.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const anchors = new Map<string, Rect>();
    for (const target of element.querySelectorAll<HTMLElement>("[data-annotation-anchor]")) {
      const box = target.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) anchors.set(target.dataset.annotationAnchor!, { x: box.left - rect.left, y: box.top - rect.top, width: box.width, height: box.height });
    }
    const next = { width: rect.width, height: rect.height, anchors };
    const current = gesture.current;
    if (current) {
      const origin = anchors.get(current.anchor) ?? { x: 0, y: 0, width: rect.width, height: rect.height };
      if (!sameWidth(current.layout.width, next.width) || current.layout.height !== next.height || JSON.stringify(origin) !== JSON.stringify(current.origin)) cancel();
    }
    const previous = layoutRef.current;
    if (previous.width !== next.width || previous.height !== next.height || JSON.stringify([...previous.anchors]) !== JSON.stringify([...anchors])) {
      layoutRef.current = next;
      setLayout(next);
    }
  }, [cancel]);

  useEffect(() => {
    const loaded = loadWorkspaceAnnotations(owner, context);
    const timer = window.setTimeout(() => {
      stateRef.current = loaded.state;
      setState(loaded.state);
      ready.current = loaded.status === "ready" || loaded.status === "empty";
      if (!ready.current) setNotice(loaded.message);
      setLauncher(document.getElementById("question-annotation-launcher"));
      measure();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context, measure, owner]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let pending = 0;
    const schedule = () => { window.cancelAnimationFrame(pending); pending = window.requestAnimationFrame(measure); };
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    const observe = () => {
      resize?.disconnect();
      resize?.observe(element);
      element.querySelectorAll("[data-annotation-anchor]").forEach((anchor) => resize?.observe(anchor));
    };
    observe();
    const mutation = new MutationObserver((mutations) => {
      if (mutations.every((record) => overlay.current?.contains(record.target) || (record.target as Element).closest?.("[data-annotation-controls]"))) return;
      observe(); schedule();
    });
    mutation.observe(element, { childList: true, subtree: true, characterData: true });
    element.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
    return () => { window.cancelAnimationFrame(pending); resize?.disconnect(); mutation.disconnect(); element.removeEventListener("load", schedule, true); window.removeEventListener("resize", schedule); };
  }, [measure]);

  // Import old per-question drafts once, without changing their original storage.
  useEffect(() => {
    if (!ready.current || state.legacyImported || !layout.width) return;
    const timer = window.setTimeout(() => {
      const imported: WorkspaceStroke[] = [];
      for (const legacy of legacyRef.current) {
        const loaded = loadQuestionAnnotations(owner, legacy);
        for (const mark of loaded.state.marks) {
          const anchor = mark.target === "question" ? `question:${legacy.questionKey}:prompt` : mark.target.startsWith("option:") ? `question:${legacy.questionKey}:${mark.target}` : mark.target;
          const rect = layout.anchors.get(anchor);
          if (!rect) continue;
          for (const stroke of mark.strokes) imported.push({ id: id(), anchor, layoutWidth: layout.width, anchorWidth: rect.width, color: stroke.color, width: Math.min(24, Math.max(0.5, stroke.width * Math.max(rect.width, rect.height))), points: stroke.points.map((point) => ({ x: point.x * rect.width, y: point.y * rect.height })) });
        }
      }
      const next = { strokes: [...stateRef.current.strokes, ...imported], legacyImported: true };
      if (validWorkspaceAnnotations(next)) persist(next);
      else setNotice("Chú thích cũ vượt giới hạn; bản cũ vẫn được giữ trên thiết bị.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [layout, owner, persist, state.legacyImported]);

  useEffect(() => {
    // A toolbar toggle can happen while a pointer is down. Drop that gesture
    // without committing it; the button handlers clear the visual preview.
    const element = root.current;
    const current = gesture.current;
    gesture.current = null;
    if (frame.current !== null) { window.cancelAnimationFrame(frame.current); frame.current = null; }
    if (current) { try { element?.releasePointerCapture(current.pointer); } catch { /* already released */ } }
    return () => {
      const stale = gesture.current;
      gesture.current = null;
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      if (stale) { try { element?.releasePointerCapture(stale.pointer); } catch { /* already released */ } }
    };
  }, [active, disabled, tool]);

  const visible = (stroke: WorkspaceStroke, currentLayout = layoutRef.current) => {
    const rect = stroke.anchor === "workspace" ? { x: 0, y: 0, width: currentLayout.width, height: currentLayout.height } : currentLayout.anchors.get(stroke.anchor);
    return rect && sameWidth(stroke.layoutWidth, currentLayout.width) && sameWidth(stroke.anchorWidth, rect.width) ? rect : null;
  };

  const point = (event: PointerEvent<HTMLDivElement>): WorkspacePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)), y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)) };
  };
  const paintPreview = () => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      const current = gesture.current;
      if (current) setPreview(current.stroke ? [...stateRef.current.strokes, { ...current.stroke, points: [...current.stroke.points] }] : current.erased);
    });
  };
  const erase = (current: Gesture, nextPoint: WorkspacePoint) => {
    const size = { width: current.layout.width, height: current.layout.height };
    const scale = Math.max(size.width, size.height);
    current.erased = current.erased.flatMap((stroke) => {
      const origin = visible(stroke, current.layout);
      if (!origin) return [stroke];
      const normalized = { color: stroke.color, width: stroke.width / scale, points: stroke.points.map((p) => ({ x: (p.x + origin.x) / size.width, y: (p.y + origin.y) / size.height })) };
      const result = eraseScratchStrokes([normalized], { x: current.previous.x / size.width, y: current.previous.y / size.height }, { x: nextPoint.x / size.width, y: nextPoint.y / size.height }, size, 22);
      if (result.length === 1 && result[0] === normalized) return [stroke];
      current.changed = true;
      return result.map((fragment, index) => ({ ...stroke, id: index ? id() : stroke.id, points: fragment.points.map((p) => ({ x: p.x * size.width - origin.x, y: p.y * size.height - origin.y })) }));
    });
    current.previous = nextPoint;
  };
  const advance = (current: Gesture, nextPoint: WorkspacePoint) => {
    if (!current.stroke) { erase(current, nextPoint); return; }
    const points = current.stroke.points;
    const next = { x: nextPoint.x - current.origin.x, y: nextPoint.y - current.origin.y };
    const last = points[points.length - 1];
    if (last.x === next.x && last.y === next.y) return;
    if (points.length >= 2_000) current.stroke.points = points.filter((_, index) => index === 0 || index % 2 === 0 || index === points.length - 1);
    current.stroke.points.push(next);
  };
  const controls = (target: EventTarget) => (target as Element).closest?.("[data-annotation-controls]");
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!drawing || controls(event.target) || !event.isPrimary || event.button > 0 || gesture.current) return;
    measure();
    const currentLayout = layoutRef.current;
    if (!currentLayout.width || !currentLayout.height) return;
    event.preventDefault(); event.stopPropagation();
    const next = point(event);
    const [anchor, origin] = closestAnchor(currentLayout, next);
    gesture.current = { pointer: event.pointerId, layout: currentLayout, anchor, origin, stroke: tool === "pen" ? { id: id(), anchor, layoutWidth: currentLayout.width, anchorWidth: origin.width, points: [{ x: next.x - origin.x, y: next.y - origin.y }], color: "#dc4f54", width: 3 } : null, previous: next, erased: stateRef.current.strokes, changed: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* embedded browser fallback */ }
    if (tool === "eraser") erase(gesture.current, next);
    paintPreview();
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointer) return;
    event.preventDefault(); event.stopPropagation(); measure();
    if (gesture.current !== current) return;
    advance(current, point(event)); paintPreview();
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointer) return;
    event.preventDefault(); event.stopPropagation(); measure();
    if (gesture.current !== current) return;
    advance(current, point(event));
    const next = current.stroke ? [...stateRef.current.strokes, current.stroke] : current.erased;
    const previous = stateRef.current.strokes;
    cancel();
    if ((current.stroke || current.changed) && persist({ ...stateRef.current, strokes: next })) {
      history.current = [...history.current.slice(-19), previous];
      setCanUndo(true);
    }
  };
  const undo = () => {
    cancel();
    const previous = history.current[history.current.length - 1] ?? stateRef.current.strokes.slice(0, -1);
    if (persist({ ...stateRef.current, strokes: previous })) history.current.pop();
    setCanUndo(history.current.length > 0 || previous.length > 0);
  };
  const clear = () => {
    cancel();
    if (!clearWorkspaceAnnotations(owner, context)) { setNotice("Chưa xóa được chú thích đã lưu. Hãy thử lại."); return; }
    persist({ strokes: [], legacyImported: true });
    history.current = []; setCanUndo(false); setConfirmClear(false);
  };
  const launcherButton = <button type="button" aria-label={active ? "Tắt bút chú thích" : "Bút chú thích"} title={active ? "Tắt bút chú thích (Esc)" : "Chú thích trên toàn bộ bài"} aria-pressed={active} disabled={disabled} data-annotation-controls data-dictionary-ignore className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-teal-ink disabled:opacity-40 ${active ? "border-teal-line bg-teal-soft" : "border-line bg-surface hover:bg-surface-soft"}`} onClick={() => { cancel(); setActive(!active); setConfirmClear(false); }}><AnnotationPencilIcon width={30} height={30} /></button>;
  const strokes = preview ?? state.strokes;
  const hiddenInk = state.strokes.some((stroke) => !visible(stroke, layout));

  return <>
    {launcher ? createPortal(launcherButton, launcher) : <div className="fixed right-4 bottom-20 z-40" data-annotation-controls>{launcherButton}</div>}
    <div ref={root} className={`relative ${className}`} data-annotation-workspace data-annotation-active={active && !disabled} data-dictionary-ignore={active && !disabled || undefined}
      style={{ touchAction: drawing ? "none" : "auto", cursor: drawing ? tool === "eraser" ? "cell" : "crosshair" : undefined }}
      onPointerDownCapture={down} onPointerMoveCapture={move} onPointerUpCapture={up}
      onPointerCancelCapture={(event) => { if (gesture.current?.pointer === event.pointerId) cancel(); }}
      onLostPointerCapture={() => { if (gesture.current) cancel(); }}
      onClickCapture={(event) => { if (active && !disabled && !controls(event.target)) { event.preventDefault(); event.stopPropagation(); } }}
      onKeyDownCapture={(event) => {
        if (active && !disabled && !controls(event.target)) {
          event.stopPropagation();
          if (event.key === "Escape") { event.preventDefault(); cancel(); setActive(false); }
          else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
          else if (event.key === "Enter" || event.key === " " || /^[1-4]$/.test(event.key)) event.preventDefault();
        }
      }}
      onKeyUpCapture={(event) => { if (active && !disabled && !controls(event.target)) event.stopPropagation(); }}>
      {children}
      <svg ref={overlay} aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-hidden" data-annotation-ink>
        {strokes.map((stroke) => {
          const origin = visible(stroke, layout);
          if (!origin) return null;
          return <g key={stroke.id} transform={`translate(${origin.x} ${origin.y})`} data-ink-anchor={stroke.anchor}>{stroke.points.length === 1 ? <circle cx={stroke.points[0].x} cy={stroke.points[0].y} r={stroke.width / 2} fill={stroke.color} /> : <path d={path(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />}</g>;
        })}
      </svg>
    </div>
    {active && !disabled && <section aria-label="Công cụ chú thích" data-annotation-controls data-dictionary-ignore className="fixed bottom-20 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 rounded-2xl border border-line bg-surface p-3 text-ink shadow-xl">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button type="button" className={buttonClass} aria-pressed={tool === "pen"} onClick={() => { cancel(); setTool("pen"); }}>Bút</button>
        <button type="button" className={`${buttonClass} inline-flex h-9 w-9 items-center justify-center p-1`} aria-label="Tẩy" title="Tẩy" aria-pressed={tool === "eraser"} onClick={() => { cancel(); setTool("eraser"); }}><AnnotationEraserIcon width={24} height={24} /></button>
        <button type="button" className={buttonClass} aria-pressed={tool === "move"} onClick={() => { cancel(); setTool("move"); }}>Di chuyển</button>
        <button type="button" className={buttonClass} disabled={!canUndo && !state.strokes.length} onClick={undo}>Hoàn tác</button>
        <button type="button" className={buttonClass} disabled={!state.strokes.length} onClick={() => { cancel(); setConfirmClear(true); }}>Xóa nét</button>
        <button type="button" className={`${buttonClass} border-teal-line text-teal-ink`} onClick={() => { cancel(); setActive(false); }}>Xong</button>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{tool === "move" ? "Cuộn đến vùng cần ghi, rồi chọn Bút. Bấm Xong để trả lời." : "Vẽ trên toàn bộ bài. Chọn Di chuyển để cuộn trên điện thoại."} Tự lưu trên thiết bị.</p>
      {hiddenInk && <p className="mt-2 text-xs text-muted">Nét ở kích thước màn hình khác được giữ riêng. Quay lại kích thước cũ để xem.</p>}
      {notice && <p role="status" className="mt-2 text-xs text-terracotta">{notice} <button type="button" className="underline" onClick={() => persist(stateRef.current)}>Thử lưu lại</button></p>}
      {confirmClear && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span>Xóa mọi nét của bài hiện tại?</span><div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => setConfirmClear(false)}>Giữ lại</button><button type="button" className={buttonClass} onClick={clear}>Xóa</button></div></div>}
    </section>}
  </>;
}

export default function WorkspaceAnnotator(props: Props) {
  const { surface, resourceId, questionKey } = props.context;
  const context = useMemo(() => ({ surface, resourceId, questionKey }), [surface, resourceId, questionKey]);
  return <StoredWorkspace key={JSON.stringify([props.uid ?? "guest", surface, resourceId, questionKey])} {...props} context={context} />;
}
