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
  onClear?: () => void;
  /** CSS color used for newly drawn strokes. */
  color?: string;
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
    onClear,
    color = DEFAULT_COLOR,
    strokeWidth = DEFAULT_STROKE_WIDTH,
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
  const strokesRef = useRef<ScratchStroke[]>(cloneStrokes(strokes ?? defaultStrokes ?? []));
  const [internalStrokes, setInternalStrokes] = useState<ScratchStroke[]>(() => cloneStrokes(defaultStrokes ?? []));
  const isControlled = strokes !== undefined;

  const draw = useCallback((snapshot: ScratchStroke[] = strokesRef.current) => {
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
    const next = cloneStrokes(strokes !== undefined ? strokes : internalStrokes);
    strokesRef.current = next;
    if (!activeStrokeRef.current) draw(next);
  }, [draw, internalStrokes, strokes]);

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
    const snapshot = cloneStrokes(next);
    strokesRef.current = snapshot;
    if (!isControlled) setInternalStrokes(snapshot);
    onChange?.(cloneStrokes(snapshot));
    draw(snapshot);
  }, [draw, isControlled, onChange]);

  const undo = useCallback(() => {
    if (!strokesRef.current.length) return;
    const next = strokesRef.current.slice(0, -1);
    commit(next);
    onUndo?.(cloneStrokes(next));
  }, [commit, onUndo]);

  const clear = useCallback(() => {
    if (!strokesRef.current.length) return;
    commit([]);
    onClear?.();
  }, [commit, onClear]);

  useImperativeHandle(ref, () => ({ undo, clear, focus: () => canvasRef.current?.focus(), getStrokes: () => cloneStrokes(strokesRef.current) }), [clear, undo]);

  const finishStroke = useCallback((shouldCommit: boolean) => {
    const canvas = canvasRef.current;
    const active = activeStrokeRef.current;
    if (canvas && activePointerRef.current !== null) {
      try { canvas.releasePointerCapture(activePointerRef.current); } catch { /* capture may already be released */ }
    }
    activePointerRef.current = null;
    activeStrokeRef.current = null;
    if (shouldCommit && active?.points.length) commit([...strokesRef.current, active].slice(-MAX_STROKES));
    else draw();
  }, [commit, draw]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || !event.isPrimary || activePointerRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    activePointerRef.current = event.pointerId;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* unsupported embedded surface */ }
    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedWidth = clamp(strokeWidth / Math.max(1, Math.max(rect.width, rect.height)), MIN_NORMALIZED_WIDTH, MAX_NORMALIZED_WIDTH);
    activeStrokeRef.current = { points: [pointFromEvent(event)], color, width: normalizedWidth };
    draw();
  }, [color, disabled, draw, pointFromEvent, strokeWidth]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || activePointerRef.current !== event.pointerId || !activeStrokeRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const stroke = activeStrokeRef.current;
    const point = pointFromEvent(event);
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
    finishStroke(true);
  }, [finishStroke]);

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

  const accessibleLabel = showKeyboardHint ? `${ariaLabel}. Vẽ bằng chuột hoặc chạm; nhấn Ctrl hoặc Cmd cùng Z để hoàn tác.` : ariaLabel;
  return <canvas
    ref={canvasRef}
    tabIndex={disabled ? -1 : 0}
    role="img"
    aria-label={accessibleLabel}
    data-dictionary-ignore="true"
    className={className}
    style={{ touchAction: "none", ...style }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerCancel}
    onKeyDown={onKeyDown}
  />;
});

export default ScratchCanvas;

