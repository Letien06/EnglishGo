import type { QuestionAnnotationContext } from "./question-annotations";

/** Whole-workspace ink anchored to a semantic content target. Coordinates are CSS pixels local to that anchor. */
export const WORKSPACE_ANNOTATION_VERSION = 1 as const;
export const WORKSPACE_ANNOTATION_PREFIX = "englishweb:workspace-annotations:v1";
export const WORKSPACE_ANNOTATION_MAX_STROKES = 300;
export const WORKSPACE_ANNOTATION_MAX_POINTS = 60_000;

export type WorkspacePoint = { x: number; y: number };
export type WorkspaceStroke = {
  id: string;
  anchor: string;
  layoutWidth: number;
  anchorWidth: number;
  points: WorkspacePoint[];
  color: string;
  width: number;
};
export type WorkspaceAnnotationState = { strokes: WorkspaceStroke[]; legacyImported: boolean };
export type WorkspaceAnnotationRead = { status: "ready" | "empty" | "corrupt" | "unavailable"; state: WorkspaceAnnotationState; message: string };
export type WorkspaceAnnotationWrite = { status: "saved" | "invalid" | "unavailable"; message: string };
export type WorkspaceAnnotationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MAX_ID = 400;
const MAX_ANCHOR = 400;
const MAX_DIMENSION = 100_000;
const MAX_COORDINATE = 100_000;
const MAX_COLOR = 32;

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function boundedString(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function finiteDimension(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_DIMENSION; }
function finiteCoordinate(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE; }
function validScope(uid: unknown, context: unknown): context is QuestionAnnotationContext {
  return boundedString(uid, 180) && object(context) && (context.surface === "listen" || context.surface === "read" || context.surface === "exam")
    && boundedString(context.resourceId, 800) && boundedString(context.questionKey, 180);
}
function validPoint(value: unknown): value is WorkspacePoint { return object(value) && finiteCoordinate(value.x) && finiteCoordinate(value.y); }
function validStroke(value: unknown): value is WorkspaceStroke {
  return object(value) && boundedString(value.id, MAX_ID) && boundedString(value.anchor, MAX_ANCHOR)
    && finiteDimension(value.layoutWidth) && finiteDimension(value.anchorWidth)
    && Array.isArray(value.points) && value.points.length > 0 && value.points.length <= 2_000 && value.points.every(validPoint)
    && boundedString(value.color, MAX_COLOR) && typeof value.width === "number" && Number.isFinite(value.width) && value.width >= 0.5 && value.width <= 24;
}

/** Validate the in-memory state and enforce global storage limits. */
export function validWorkspaceAnnotations(value: unknown): value is WorkspaceAnnotationState {
  if (!object(value) || typeof value.legacyImported !== "boolean" || !Array.isArray(value.strokes) || value.strokes.length > WORKSPACE_ANNOTATION_MAX_STROKES) return false;
  let points = 0; const ids = new Set<string>();
  for (const stroke of value.strokes) {
    if (!validStroke(stroke)) return false;
    if (ids.has(stroke.id)) return false;
    ids.add(stroke.id);
    points += stroke.points.length;
    if (points > WORKSPACE_ANNOTATION_MAX_POINTS) return false;
  }
  return true;
}

function emptyState(): WorkspaceAnnotationState { return { strokes: [], legacyImported: false }; }
function cloneState(state: WorkspaceAnnotationState): WorkspaceAnnotationState { return { legacyImported: state.legacyImported, strokes: state.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })) }; }
function storageOrGlobal(storage?: WorkspaceAnnotationStorage): WorkspaceAnnotationStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

export function workspaceAnnotationStorageKey(uid: string, context: QuestionAnnotationContext): string {
  return [WORKSPACE_ANNOTATION_PREFIX, uid, context.surface, context.resourceId, context.questionKey].map((part) => encodeURIComponent(part)).join(":");
}

export function loadWorkspaceAnnotations(uid: string, context: QuestionAnnotationContext, storage?: WorkspaceAnnotationStorage): WorkspaceAnnotationRead {
  if (!validScope(uid, context)) return { status: "unavailable", state: emptyState(), message: "Chưa có ngữ cảnh chú thích hợp lệ." };
  const target = storageOrGlobal(storage); if (!target) return { status: "unavailable", state: emptyState(), message: "Thiết bị này không cho phép lưu chú thích." };
  let raw: string | null;
  try { raw = target.getItem(workspaceAnnotationStorageKey(uid, context)); } catch { return { status: "unavailable", state: emptyState(), message: "Không thể đọc chú thích trên thiết bị này." }; }
  if (raw === null) return { status: "empty", state: emptyState(), message: "Bật bút để chú thích trên nội dung." };
  try {
    const value: unknown = JSON.parse(raw);
    if (!object(value) || value.version !== WORKSPACE_ANNOTATION_VERSION || typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))) throw new Error("invalid envelope");
    const state = { strokes: value.strokes, legacyImported: value.legacyImported };
    if (!validWorkspaceAnnotations(state)) throw new Error("invalid workspace annotations");
    return { status: "ready", state: cloneState(state), message: "Đã khôi phục chú thích." };
  } catch { return { status: "corrupt", state: emptyState(), message: "Dữ liệu chú thích cũ không hợp lệ; dữ liệu cũ được giữ nguyên." }; }
}

export function saveWorkspaceAnnotations(uid: string, context: QuestionAnnotationContext, state: WorkspaceAnnotationState, storage?: WorkspaceAnnotationStorage): WorkspaceAnnotationWrite {
  if (!validScope(uid, context) || !validWorkspaceAnnotations(state)) return { status: "invalid", message: "Chú thích vượt giới hạn hoặc có dữ liệu không hợp lệ." };
  const target = storageOrGlobal(storage); if (!target) return { status: "unavailable", message: "Thiết bị này không cho phép lưu chú thích." };
  const current = loadWorkspaceAnnotations(uid, context, target); if (current.status === "corrupt" || current.status === "unavailable") return { status: "unavailable", message: current.message };
  try { target.setItem(workspaceAnnotationStorageKey(uid, context), JSON.stringify({ version: WORKSPACE_ANNOTATION_VERSION, savedAt: new Date().toISOString(), ...cloneState(state) })); }
  catch { return { status: "unavailable", message: "Không thể lưu chú thích trên thiết bị này." }; }
  return { status: "saved", message: "Đã lưu chú thích." };
}

export function clearWorkspaceAnnotations(uid: string, context: QuestionAnnotationContext, storage?: WorkspaceAnnotationStorage): boolean {
  const target = storageOrGlobal(storage); if (!target || !validScope(uid, context)) return false;
  try { target.removeItem(workspaceAnnotationStorageKey(uid, context)); return true; } catch { return false; }
}
