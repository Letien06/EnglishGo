"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ScratchCanvas, { type ScratchCanvasHandle, type ScratchStroke } from "./ScratchCanvas";
import AnnotationEraserIcon from "./AnnotationEraserIcon";
import { clearQuestionAnnotations, loadQuestionAnnotations, saveQuestionAnnotations, type QuestionAnnotation, type QuestionAnnotationContext } from "@/lib/question-annotations";

type AnnotationApi = {
  active: boolean;
  tool: "pen" | "eraser";
  marks: QuestionAnnotation[];
  update: (target: string, strokes: ScratchStroke[]) => void;
  register: (target: string, handle: ScratchCanvasHandle | null) => void;
  availability: (target: string, available: boolean) => void;
  report: (message: string) => void;
};
const AnnotationContext = createContext<AnnotationApi | null>(null);
function useAnnotation() {
  const value = useContext(AnnotationContext);
  if (!value) throw new Error("QuestionAnnotationTarget needs QuestionAnnotator");
  return value;
}

const buttonClass = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-ink transition-colors hover:bg-surface-soft focus-visible:outline-2 focus-visible:outline-teal-ink disabled:opacity-40";

/** Each text block owns its ink, so opening translations/results cannot stretch other marks. */
export function QuestionAnnotationTarget({ target, children, className = "" }: { target: string; children: ReactNode; className?: string }) {
  const api = useAnnotation();
  const strokes = api.marks.find((mark) => mark.target === target)?.strokes ?? [];
  const setHandle = useCallback((handle: ScratchCanvasHandle | null) => api.register(target, handle), [api, target]);
  return <div className={`relative ${className}`} data-annotation-target={target}>
    {children}
    <ScratchCanvas
      ref={setHandle}
      strokes={strokes}
      onChange={(next) => api.update(target, next)}
      onUndoAvailabilityChange={(available) => api.availability(target, available)}
      onLimit={api.report}
      color="#dc4f54"
      strokeWidth={3}
      tool={api.tool}
      eraserSize={22}
      disabled={!api.active}
      showKeyboardHint={false}
      ariaLabel={`Chú thích ${target === "question" ? "câu hỏi" : target.startsWith("option:") ? "đáp án" : "nội dung"}`}
      className={`absolute inset-0 z-20 h-full w-full ${api.active ? "" : "pointer-events-none"}`}
    />
  </div>;
}

function StoredAnnotator({ uid, context, children, className = "" }: { uid: string | null; context: QuestionAnnotationContext; children: ReactNode; className?: string }) {
  const owner = uid ?? "guest";
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [marks, setMarks] = useState<QuestionAnnotation[]>([]);
  const snapshot = useRef<QuestionAnnotation[]>([]);
  const [notice, setNotice] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const handles = useRef(new Map<string, ScratchCanvasHandle>());
  const undoable = useRef(new Map<string, boolean>());
  const history = useRef<string[]>([]);
  const clearing = useRef(false);

  useEffect(() => {
    // Read after hydration; server output never contains another device's ink.
    const loaded = loadQuestionAnnotations(owner, context);
    const timer = window.setTimeout(() => {
      snapshot.current = loaded.state.marks;
      setMarks(loaded.state.marks);
      if (loaded.status === "corrupt" || loaded.status === "unavailable") setNotice(loaded.message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [owner, context]);

  const register = useCallback((target: string, handle: ScratchCanvasHandle | null) => {
    if (handle) handles.current.set(target, handle);
    else { handles.current.delete(target); undoable.current.delete(target); }
  }, []);
  const availability = useCallback((target: string, available: boolean) => {
    undoable.current.set(target, available);
    setCanUndo([...undoable.current.values()].some(Boolean));
  }, []);
  const update = useCallback((target: string, strokes: ScratchStroke[]) => {
    const next = snapshot.current.filter((mark) => mark.target !== target);
    if (strokes.length) next.push({ id: target, target, strokes });
    if (clearing.current) {
      snapshot.current = next;
      setMarks(next);
      return;
    }
    const result = saveQuestionAnnotations(owner, context, next);
    if (result.status === "invalid") { setNotice(result.message); return; }
    snapshot.current = next;
    setMarks(next);
    history.current.push(target);
    setNotice(result.status === "saved" ? "" : result.message);
  }, [owner, context]);
  const undo = () => {
    const recent = [...history.current].reverse().find((target) => undoable.current.get(target))
      ?? [...undoable.current.entries()].find(([, available]) => available)?.[0];
    if (recent) handles.current.get(recent)?.undo();
  };
  const clear = () => {
    if (!clearQuestionAnnotations(owner, context)) { setNotice("Chưa xóa được chú thích đã lưu. Hãy thử lại."); return; }
    clearing.current = true;
    for (const handle of handles.current.values()) handle.clear();
    clearing.current = false;
    snapshot.current = [];
    setMarks([]);
    history.current = [];
    setConfirmClear(false);
    setNotice("");
  };

  return <AnnotationContext.Provider value={{ active, tool, marks, update, register, availability, report: setNotice }}>
    <div className={`question-annotator ${className}`} data-annotation-active={active} data-dictionary-ignore={active || undefined}
      onClickCapture={(event) => { if (active && !(event.target as HTMLElement).closest("[data-annotation-controls]")) { event.preventDefault(); event.stopPropagation(); } }}
      onKeyDownCapture={(event) => {
        if (active || (event.target as HTMLElement).closest("[data-annotation-controls]")) event.stopPropagation();
        if (active && event.key === "Escape") { event.preventDefault(); setActive(false); }
      }}
      onKeyUpCapture={(event) => { if (active || (event.target as HTMLElement).closest("[data-annotation-controls]")) event.stopPropagation(); }}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2" data-annotation-controls data-dictionary-ignore>
        <button type="button" className={`${buttonClass} ${active ? "border-teal-line bg-teal-soft text-teal-ink" : ""}`} aria-pressed={active} onClick={() => { setActive((value) => !value); setConfirmClear(false); }}><span aria-hidden="true">✎</span>{active ? "Xong chú thích" : "Bút chú thích"}</button>
        {active && <>
          <button type="button" className={buttonClass} aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>Bút</button>
          <button type="button" className={`${buttonClass} h-9 w-9 p-1`} aria-label="Tẩy" title="Tẩy" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}><AnnotationEraserIcon width={22} height={22} /></button>
          <button type="button" className={buttonClass} disabled={!canUndo} onClick={undo}>Hoàn tác</button>
          <button type="button" className={buttonClass} disabled={!marks.length} onClick={() => setConfirmClear(true)}>Xóa nét</button>
        </>}
      </div>
      {active && <p className="mb-3 text-xs text-muted" data-annotation-controls>Kéo trên câu hỏi hoặc đáp án để chú thích. Bấm Xong chú thích để trả lời. Tự lưu trên thiết bị.</p>}
      {notice && <p role="status" className="mb-3 text-xs text-terracotta" data-annotation-controls>{notice}</p>}
      {confirmClear && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-soft p-3 text-xs" data-annotation-controls>
        <span>Xóa toàn bộ nét chú thích của câu này?</span><span className="flex gap-2"><button type="button" className={buttonClass} onClick={() => setConfirmClear(false)}>Giữ lại</button><button type="button" className={buttonClass} onClick={clear}>Xóa</button></span>
      </div>}
      {children}
    </div>
  </AnnotationContext.Provider>;
}

export default function QuestionAnnotator(props: { uid: string | null; context: QuestionAnnotationContext; children: ReactNode; className?: string }) {
  const { uid, context } = props;
  const { surface, resourceId, questionKey } = context;
  const identity = JSON.stringify([uid ?? "guest", surface, resourceId, questionKey]);
  const stableContext = useMemo(() => ({ surface, resourceId, questionKey }), [questionKey, resourceId, surface]);
  return <StoredAnnotator key={identity} {...props} context={stableContext} />;
}

