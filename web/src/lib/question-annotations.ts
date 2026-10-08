import type { ScratchStroke } from "./scratch-paper";

export const QUESTION_ANNOTATION_VERSION = 1 as const;
export const QUESTION_ANNOTATION_PREFIX = "englishweb:question-annotations:v1";
export const QUESTION_ANNOTATION_MAX_STROKES = 300;
export const QUESTION_ANNOTATION_MAX_POINTS = 60_000;

export type QuestionAnnotationSurface = "listen" | "read" | "exam";
export type QuestionAnnotationContext = { surface: QuestionAnnotationSurface; resourceId: string; questionKey: string };
export type QuestionAnnotation = { id: string; target: string; strokes: ScratchStroke[] };
export type QuestionAnnotationState = { marks: QuestionAnnotation[]; savedAt: string | null };
export type QuestionAnnotationRead = { status: "ready" | "empty" | "corrupt" | "unavailable"; state: QuestionAnnotationState; message: string };
export type QuestionAnnotationWrite = { status: "saved" | "invalid" | "unavailable"; savedAt: string | null; message: string };
export type QuestionAnnotationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MAX_TARGETS = 120;
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function boundedString(value: unknown, max = 180): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function validScope(uid: unknown, context: unknown): context is QuestionAnnotationContext {
  return boundedString(uid) && object(context) && ["listen", "read", "exam"].includes(String(context.surface)) && boundedString(context.resourceId, 800) && boundedString(context.questionKey);
}
function validStroke(value: unknown): value is ScratchStroke {
  return object(value) && Array.isArray(value.points) && value.points.length > 0 && value.points.length <= 2_000
    && value.points.every((point) => object(point) && typeof point.x === "number" && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1 && typeof point.y === "number" && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1)
    && boundedString(value.color, 32) && typeof value.width === "number" && Number.isFinite(value.width) && value.width > 0 && value.width <= 0.12;
}
export function validQuestionAnnotations(value: unknown): value is QuestionAnnotation[] {
  if (!Array.isArray(value) || value.length > MAX_TARGETS) return false;
  let strokeCount = 0, pointCount = 0; const targets = new Set<string>(), ids = new Set<string>();
  for (const mark of value) {
    if (!object(mark) || !boundedString(mark.id) || !boundedString(mark.target) || !Array.isArray(mark.strokes) || !mark.strokes.every(validStroke) || targets.has(mark.target) || ids.has(mark.id)) return false;
    targets.add(mark.target); ids.add(mark.id); strokeCount += mark.strokes.length;
    pointCount += mark.strokes.reduce((sum, stroke: ScratchStroke) => sum + stroke.points.length, 0);
    if (strokeCount > QUESTION_ANNOTATION_MAX_STROKES || pointCount > QUESTION_ANNOTATION_MAX_POINTS) return false;
  }
  return true;
}
function emptyState(): QuestionAnnotationState { return { marks: [], savedAt: null }; }
function cloneState(state: QuestionAnnotationState): QuestionAnnotationState { return { savedAt: state.savedAt, marks: state.marks.map(({ id, target, strokes }) => ({ id, target, strokes: strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })) })) }; }
function storageOrGlobal(storage?: QuestionAnnotationStorage): QuestionAnnotationStorage | null { if (storage) return storage; if (typeof window === "undefined") return null; try { return window.localStorage; } catch { return null; } }

export function questionAnnotationStorageKey(uid: string, context: QuestionAnnotationContext): string { return [QUESTION_ANNOTATION_PREFIX, uid, context.surface, context.resourceId, context.questionKey].map((part) => encodeURIComponent(part)).join(":"); }

export function loadQuestionAnnotations(uid: string, context: QuestionAnnotationContext, storage?: QuestionAnnotationStorage): QuestionAnnotationRead {
  if (!validScope(uid, context)) return { status: "unavailable", state: emptyState(), message: "Chưa có ngữ cảnh chú thích hợp lệ." };
  const target = storageOrGlobal(storage); if (!target) return { status: "unavailable", state: emptyState(), message: "Thiết bị này không cho phép lưu chú thích." };
  let raw: string | null; try { raw = target.getItem(questionAnnotationStorageKey(uid, context)); } catch { return { status: "unavailable", state: emptyState(), message: "Không thể đọc chú thích trên thiết bị này." }; }
  if (raw === null) return { status: "empty", state: emptyState(), message: "Bật bút để chú thích trực tiếp trên nội dung." };
  try { const value: unknown = JSON.parse(raw); if (!object(value) || value.version !== QUESTION_ANNOTATION_VERSION || !validQuestionAnnotations(value.marks) || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) throw new Error("Invalid annotations"); return { status: "ready", state: cloneState({ marks: value.marks, savedAt: value.savedAt }), message: "Đã khôi phục chú thích." }; }
  catch { return { status: "corrupt", state: emptyState(), message: "Dữ liệu chú thích cũ không hợp lệ; dữ liệu cũ được giữ nguyên." }; }
}

export function saveQuestionAnnotations(uid: string, context: QuestionAnnotationContext, marks: QuestionAnnotation[], storage?: QuestionAnnotationStorage): QuestionAnnotationWrite {
  if (!validScope(uid, context) || !validQuestionAnnotations(marks)) return { status: "invalid", savedAt: null, message: "Chú thích vượt giới hạn hoặc có dữ liệu không hợp lệ." };
  const target = storageOrGlobal(storage); if (!target) return { status: "unavailable", savedAt: null, message: "Thiết bị này không cho phép lưu chú thích." };
  const current = loadQuestionAnnotations(uid, context, target); if (current.status === "corrupt" || current.status === "unavailable") return { status: "unavailable", savedAt: null, message: current.message };
  const savedAt = new Date().toISOString(); try { target.setItem(questionAnnotationStorageKey(uid, context), JSON.stringify({ version: QUESTION_ANNOTATION_VERSION, savedAt, marks })); } catch { return { status: "unavailable", savedAt: null, message: "Không thể lưu chú thích trên thiết bị này." }; }
  return { status: "saved", savedAt, message: "Đã lưu chú thích." };
}
export function clearQuestionAnnotations(uid: string, context: QuestionAnnotationContext, storage?: QuestionAnnotationStorage): boolean { const target = storageOrGlobal(storage); if (!target || !validScope(uid, context)) return false; try { target.removeItem(questionAnnotationStorageKey(uid, context)); return true; } catch { return false; } }
