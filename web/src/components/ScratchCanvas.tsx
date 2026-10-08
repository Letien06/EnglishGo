"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** A point stored relative to the canvas (both values are in the 0..1 range). */
export interface ScratchPoint {
  x: number;
  y: number;
}

/**
 * A vector stroke. Keeping points normalized means a draft survives a resize,
 * orientation change, or a device pixel ratio change without becoming blurry.
 * `width` is the fraction of the larger canvas dimension used for the stroke.
 */
export interface ScratchStroke {
  points: ScratchPoint[];
  color: string;
  width: number;
}

export interface ScratchCanvasHandle {
  /** Remove the most recent stroke and notify the parent. */
  undo: () => void;
  /** Remove every stroke and notify the parent. */
  clear: () => void;
  /** Move keyboard focus to the drawing surface. */
  focus: () => void;
  /** Read the current vector snapshot without touching React state. */
  getStrokes: () => ScratchStroke[];
}

export interface ScratchCanvasProps {
  /** Controlled stroke value. Omit this prop to use `defaultStrokes` in uncontrolled mode. */
  strokes?: ScratchStroke[];
  defaultStrokes?: ScratchStroke[];
  onChange?: (strokes: ScratchStroke[]) => void;
  /** Optional lifecycle hooks for a toolbar outside of this component. */
  onUndo?: (strokes: ScratchStroke[]) => void;
  /** Reports whether the toolbar can currently undo, including persisted ink. */
  onUndoAvailabilityChange?: (available: boolean) => void;
  /** Called when an operation would exceed local draft storage limits. */
  onLimit?: (message: string) => void;
  onClear?: () => void;
  /** CSS color used for newly drawn strokes. */
  color?: string;
  /** Drawing tool. The eraser removes only the portion of a vector stroke it crosses. */
  tool?: "pen" | "eraser";
  /** Eraser diameter in CSS pixels. */
  eraserSize?: number;
  /** New stroke width in CSS pixels; it is converted to a normalized value on pointer down. */
  strokeWidth?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  /** Set to false when the surrounding panel provides its own keyboard help. */
  showKeyboardHint?: boolean;
}

// Brand gold stays visible on both the dark and light app themes. Consumers can
// pass their own ink color when the paper surface has a custom background.
const DEFAULT_COLOR = "#E9B25D";
const DEFAULT_STROKE_WIDTH = 3;
const MIN_NORMALIZED_WIDTH = 0.001;
const MAX_NORMALIZED_WIDTH = 0.12;
const MAX_STROKE_POINTS = 2_000;
const MAX_STROKES = 300;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function cloneStrokes(strokes: ScratchStroke[]): ScratchStroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ x: point.x, y: point.y })),
  }));
}

function fitsStorageBudget(strokes: ScratchStroke[]): boolean {
  return strokes.length <= MAX_STROKES && strokes.every((stroke) => stroke.points.length <= MAX_STROKE_POINTS);
}

type Interval = [number, number];

function linearRange(origin: number, delta: number, low: number, high: number): Interval | null {
  if (Math.abs(delta) < 1e-10) return origin >= low && origin <= high ? [0, 1] : null;
  const a = (low - origin) / delta;
  const b = (high - origin) / delta;
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(1, Math.max(a, b));
  return start <= end ? [start, end] : null;
}

function circleRange(a: ScratchPoint, b: ScratchPoint, center: ScratchPoint, radius: number): Interval | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ox = a.x - center.x, oy = a.y - center.y;
  const quadratic = dx * dx + dy * dy;
  if (quadratic < 1e-10) return ox * ox + oy * oy <= radius * radius ? [0, 1] : null;
  const linear = 2 * (ox * dx + oy * dy);
  const discriminant = linear * linear - 4 * quadratic * (ox * ox + oy * oy - radius * radius);
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const start = Math.max(0, (-linear - root) / (2 * quadratic));
  const end = Math.min(1, (-linear + root) / (2 * quadratic));
  return start <= end ? [start, end] : null;
}

/** Interval of a line segment covered by the swept circular eraser. */
function capsuleRange(a: ScratchPoint, b: ScratchPoint, from: ScratchPoint, to: ScratchPoint, radius: number): Interval | null {
  const ranges: Interval[] = [];
  const startCircle = circleRange(a, b, from, radius);
  const endCircle = circleRange(a, b, to, radius);
  if (startCircle) ranges.push(startCircle);
  if (endCircle) ranges.push(endCircle);
  const ex = to.x - from.x, ey = to.y - from.y;
  const length = Math.hypot(ex, ey);
  if (length > 1e-8) {
    const ux = ex / length, uy = ey / length;
    const ax = a.x - from.x, ay = a.y - from.y;
    const dx = b.x - a.x, dy = b.y - a.y;
    const along = linearRange(ax * ux + ay * uy, dx * ux + dy * uy, 0, length);
    const across = linearRange(-ax * uy + ay * ux, -dx * uy + dy * ux, -radius, radius);
    if (along && across) {
      const start = Math.max(along[0], across[0]);
      const end = Math.min(along[1], across[1]);
      if (start <= end) ranges.push([start, end]);
    }
  }
  // A capsule is convex, so its intersection with a segment is one interval.
  return ranges.length ? [Math.min(...ranges.map(([start]) => start)), Math.max(...ranges.map(([, end]) => end))] : null;
}

/** Split vector strokes around a swept eraser; untouched vectors keep their exact points. */
export function eraseScratchStrokes(strokes: ScratchStroke[], from: ScratchPoint, to: ScratchPoint, size: { width: number; height: number }, eraserSize: number): ScratchStroke[] {
  const pixel = (point: ScratchPoint): ScratchPoint => ({ x: point.x * size.width, y: point.y * size.height });
  const start = pixel(from), end = pixel(to);
  const result: ScratchStroke[] = [];
  for (const stroke of strokes) {
    const radius = Math.max(1, eraserSize / 2) + stroke.width * Math.max(size.width, size.height) / 2;
    if (stroke.points.length === 1) {
      const point = pixel(stroke.points[0]);
      if (!capsuleRange(point, point, start, end, radius)) result.push(stroke);
      continue;
    }
    let fragment: ScratchPoint[] = [];
    let touched = false;
    const fragments: ScratchPoint[][] = [];
    const append = (point: ScratchPoint) => {
      const previous = fragment[fragment.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y) fragment.push(point);
    };
    const flush = () => { if (fragment.length > 1) fragments.push(fragment); fragment = []; };
    for (let index = 1; index < stroke.points.length; index++) {
      const a = stroke.points[index - 1], b = stroke.points[index];
      const covered = capsuleRange(pixel(a), pixel(b), start, end, radius);
      if (!covered) { append(a); append(b); continue; }
      touched = true;
      const interpolate = (amount: number) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount });
      if (covered[0] > 0) { append(a); append(interpolate(covered[0])); }
      flush();
      if (covered[1] < 1) { append(interpolate(covered[1])); append(b); }
    }
    flush();
    if (!touched) { result.push(stroke); continue; }
    for (const points of fragments) {
      let length = 0;
      for (let index = 1; index < points.length; index++) length += Math.hypot((points[index].x - points[index - 1].x) * size.width, (points[index].y - points[index - 1].y) * size.height);
      if (length >= 1) result.push({ ...stroke, points });
    }
  }
  return result;
}

/**
 * Lightweight vector drawing surface used by the scratch-paper panel.
 *
 * The canvas bitmap is only a rendering cache. The source of truth is the
 * normalized stroke list, so resizing never scales an already-rasterized image.
 */
const ScratchCanvas = forwardRef<ScratchCanvasHandle, ScratchCanvasProps>(function ScratchCanvas(
  {
    strokes,
    defaultStrokes,
    onChange,
    onUndo,
    onUndoAvailabilityChange,
    onLimit,
    onClear,
    color = DEFAULT_COLOR,
    strokeWidth = DEFAULT_STROKE_WIDTH,
    tool = "pen",
    eraserSize = 24,
    disabled = false,
    className,
    style,
    ariaLabel = "Vùng vẽ giấy nháp",
    showKeyboardHint = true,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const activeStrokeRef = useRef<ScratchStroke | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const eraserRef = useRef<{ previous: ScratchPoint; strokes: ScratchStroke[]; changed: boolean; diameter: number } | null>(null);
  const undoHistoryRef = useRef<ScratchStroke[][]>([]);
  const strokesRef = useRef<ScratchStroke[]>(cloneStrokes(strokes ?? defaultStrokes ?? []));
  const [internalStrokes, setInternalStrokes] = useState<ScratchStroke[]>(() => cloneStrokes(defaultStrokes ?? []));
  const isControlled = strokes !== undefined;

  const reportUndoAvailability = useCallback(() => {
    onUndoAvailabilityChange?.(undoHistoryRef.current.length > 0 || strokesRef.current.length > 0);
  }, [onUndoAvailabilityChange]);

  const draw = useCallback((snapshot: ScratchStroke[] = eraserRef.current?.strokes ?? strokesRef.current) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { width, height } = sizeRef.current;
    if (width <= 0 || height <= 0) return;

    context.clearRect(0, 0, width, height);
    const scale = Math.max(width, height);
    for (const stroke of snapshot) {
      if (!stroke.points.length) continue;
      const lineWidth = Math.max(1, clamp(stroke.width, MIN_NORMALIZED_WIDTH, MAX_NORMALIZED_WIDTH) * scale);
      context.beginPath();
      context.strokeStyle = stroke.color || color;
      context.fillStyle = stroke.color || color;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      const first = stroke.points[0];
      const firstX = clamp(first.x) * width;
      const firstY = clamp(first.y) * height;
      if (stroke.points.length === 1) {
        context.arc(firstX, firstY, lineWidth / 2, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.moveTo(firstX, firstY);
      for (const point of stroke.points.slice(1)) context.lineTo(clamp(point.x) * width, clamp(point.y) * height);
      context.stroke();
    }
    const activeStroke = activeStrokeRef.current;
    if (activeStroke) {
      // Draw the in-progress stroke immediately without waiting for React state.
      const lineWidth = Math.max(1, clamp(activeStroke.width, MIN_NORMALIZED_WIDTH, MAX_NORMALIZED_WIDTH) * scale);
      const points = activeStroke.points;
      if (points.length) {
        context.beginPath();
        context.strokeStyle = activeStroke.color || color;
        context.fillStyle = activeStroke.color || color;
        context.lineWidth = lineWidth;
        context.lineCap = "round";
        context.lineJoin = "round";
        const first = points[0];
        const firstX = clamp(first.x) * width;
        const firstY = clamp(first.y) * height;
        if (points.length === 1) {
          context.arc(firstX, firstY, lineWidth / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.moveTo(firstX, firstY);
          for (const point of points.slice(1)) context.lineTo(clamp(point.x) * width, clamp(point.y) * height);
          context.stroke();
        }
      }
    }
  }, [color]);

  // Keep refs current for pointer handlers without recreating listeners for every
  // parent render. A cloned snapshot also protects consumers from accidental
  // mutation during drawing.
  useEffect(() => {
    if (activePointerRef.current !== null) return;
    const next = cloneStrokes(strokes !== undefined ? strokes : internalStrokes);
    strokesRef.current = next;
    if (!activeStrokeRef.current) draw(next);
    reportUndoAvailability();
  }, [draw, internalStrokes, reportUndoAvailability, strokes]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const pixelRatio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    sizeRef.current = { width, height };
    const nextWidth = Math.round(width * pixelRatio);
    const nextHeight = Math.round(height * pixelRatio);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    const context = canvas.getContext("2d");
    context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resize();
    const frame = window.requestAnimationFrame(resize);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [resize]);

  const pointFromEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): ScratchPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
  }, []);

  const commit = useCallback((next: ScratchStroke[]) => {
    undoHistoryRef.current = [...undoHistoryRef.current.slice(-19), cloneStrokes(strokesRef.current)];
    const snapshot = cloneStrokes(next);
    strokesRef.current = snapshot;
    if (!isControlled) setInternalStrokes(snapshot);
    onChange?.(cloneStrokes(snapshot));
    draw(snapshot);
    reportUndoAvailability();
  }, [draw, isControlled, onChange, reportUndoAvailability]);

  const undo = useCallback(() => {
    const restored = undoHistoryRef.current.pop();
    if (!restored && !strokesRef.current.length) { reportUndoAvailability(); return; }
    const next = restored ?? strokesRef.current.slice(0, -1);
    strokesRef.current = cloneStrokes(next);
    if (!isControlled) setInternalStrokes(next);
    onChange?.(cloneStrokes(next));
    draw(next);
    onUndo?.(cloneStrokes(next));
    reportUndoAvailability();
  }, [draw, isControlled, onChange, onUndo, reportUndoAvailability]);

  const clear = useCallback(() => {
    if (!strokesRef.current.length) return;
    commit([]);
    onClear?.();
  }, [commit, onClear]);

  useImperativeHandle(ref, () => ({ undo, clear, focus: () => canvasRef.current?.focus(), getStrokes: () => cloneStrokes(strokesRef.current) }), [clear, undo]);

  const finishStroke = useCallback((shouldCommit: boolean) => {
    const canvas = canvasRef.current;
    const active = activeStrokeRef.current;
    const eraser = eraserRef.current;
    if (canvas && activePointerRef.current !== null) {
      try { canvas.releasePointerCapture(activePointerRef.current); } catch { /* capture may already be released */ }
    }
    activePointerRef.current = null;
    activeStrokeRef.current = null;
    eraserRef.current = null;
    if (shouldCommit && eraser?.changed) {
      if (fitsStorageBudget(eraser.strokes)) commit(eraser.strokes);
      else {
        onLimit?.("Nét tẩy này tạo quá nhiều đoạn; giấy nháp được giữ nguyên.");
        draw(strokesRef.current);
      }
    }
    else if (shouldCommit && active?.points.length) {
      const next = [...strokesRef.current, active];
      if (fitsStorageBudget(next)) commit(next);
      else {
        onLimit?.("Giấy nháp đã đầy. Hãy tẩy hoặc xóa bớt nét trước khi vẽ thêm.");
        draw(strokesRef.current);
      }
    }
    else draw();
  }, [commit, draw, onLimit]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !event.isPrimary || activePointerRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    activePointerRef.current = event.pointerId;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* unsupported embedded surface */ }
    const rect = event.currentTarget.getBoundingClientRect();
    const point = pointFromEvent(event);
    if (tool === "eraser") {
      const next = eraseScratchStrokes(strokesRef.current, point, point, sizeRef.current, eraserSize);
      eraserRef.current = { previous: point, strokes: next, changed: next.some((stroke, index) => stroke !== strokesRef.current[index]) || next.length !== strokesRef.current.length, diameter: eraserSize };
      draw();
      return;
    }
    const normalizedWidth = clamp(strokeWidth / Math.max(1, Math.max(rect.width, rect.height)), MIN_NORMALIZED_WIDTH, MAX_NORMALIZED_WIDTH);
    activeStrokeRef.current = { points: [pointFromEvent(event)], color, width: normalizedWidth };
    draw();
  }, [color, disabled, draw, eraserSize, pointFromEvent, strokeWidth, tool]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    if (eraserRef.current) {
      const eraser = eraserRef.current;
      const next = eraseScratchStrokes(eraser.strokes, eraser.previous, point, sizeRef.current, eraser.diameter);
      eraser.changed ||= next.some((stroke, index) => stroke !== eraser.strokes[index]) || next.length !== eraser.strokes.length;
      eraser.previous = point;
      eraser.strokes = next;
      draw();
      return;
    }
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const previousPoint = stroke.points[stroke.points.length - 1];
    const size = sizeRef.current;
    if (previousPoint && Math.hypot((point.x - previousPoint.x) * size.width, (point.y - previousPoint.y) * size.height) < 0.6) return;
    if (stroke.points.length >= MAX_STROKE_POINTS) {
      stroke.points = stroke.points.filter((_, index) => index === 0 || index === stroke.points.length - 1 || index % 2 === 0);
    }
    stroke.points.push(point);
    draw();
  }, [disabled, draw, pointFromEvent]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (eraserRef.current) {
      const eraser = eraserRef.current;
      const next = eraseScratchStrokes(eraser.strokes, eraser.previous, pointFromEvent(event), sizeRef.current, eraser.diameter);
      eraser.changed ||= next.some((stroke, index) => stroke !== eraser.strokes[index]) || next.length !== eraser.strokes.length;
      eraser.strokes = next;
    }
    finishStroke(true);
  }, [finishStroke, pointFromEvent]);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.stopPropagation();
    finishStroke(false);
  }, [finishStroke]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLCanvasElement>) => {
    event.stopPropagation();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
  }, [undo]);

  const toolLabel = tool === "eraser" ? "Tẩy nét bằng chuột hoặc chạm" : "Vẽ bằng chuột hoặc chạm";
  const accessibleLabel = showKeyboardHint ? `${ariaLabel}. ${toolLabel}; nhấn Ctrl hoặc Cmd cùng Z để hoàn tác.` : `${ariaLabel}. ${tool === "eraser" ? "Đang dùng tẩy" : "Đang dùng bút"}`;
  return <canvas
    ref={canvasRef}
    tabIndex={disabled ? -1 : 0}
    role="img"
    aria-label={accessibleLabel}
    data-dictionary-ignore="true"
    className={className}
    style={{ touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair", ...style }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    onKeyDown={onKeyDown}
  />;
});

export default ScratchCanvas;

