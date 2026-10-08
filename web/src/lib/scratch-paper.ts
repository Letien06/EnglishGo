/**
 * Device-local scratch paper used while a learner is in a lesson or exam.
 *
 * The paper deliberately lives outside Firestore: it is temporary working
 * space, and persisting it remotely would add a read/write to every lesson.
 * Callers can debounce `saveScratchPaper` as needed; each call is a complete
 * snapshot so a refresh never leaves a partially-written draft.
 */

export const SCRATCH_PAPER_EVENT = "englishweb:scratch-paper-changed";
export const SCRATCH_PAPER_VERSION = 1 as const;
export const SCRATCH_PAPER_PREFIX = "englishweb:scratch-paper:v1";

export type ScratchPaperSurface = "listen" | "read" | "exam";
export type ScratchPaperContext = {
  /** Stable page or test identity. Do not include the current question index. */
  surface: ScratchPaperSurface;
  resourceId: string;
};

export type ScratchPoint = { x: number; y: number };
export type ScratchStroke = {
  points: ScratchPoint[];
  color: string;
  width: number;
};
export type ScratchPaperDraft = {
  text: string;
  strokes: ScratchStroke[];
};
export type ScratchPaperState = ScratchPaperDraft & { savedAt: string | null };

export type ScratchPaperReadStatus = "ready" | "unavailable" | "corrupt" | "invalid";
export type ScratchPaperRead = {
  status: ScratchPaperReadStatus;
  state: ScratchPaperState;
  message: string;
};

export type ScratchPaperWriteStatus = "saved" | "unavailable" | "corrupt" | "invalid";
export type ScratchPaperWrite = {
  status: ScratchPaperWriteStatus;
  savedAt: string | null;
  message: string;
};

export type ScratchPaperClearStatus = "cleared" | "missing" | "unavailable" | "invalid";
export type ScratchPaperClear = {
  status: ScratchPaperClearStatus;
  message: string;
};

/** Small subset of Storage so tests and embedded webviews can provide a safe adapter. */
export type ScratchPaperStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const EMPTY_STATE: ScratchPaperState = { text: "", strokes: [], savedAt: null };
const MAX_TEXT_LENGTH = 100_000;
const MAX_STROKES = 300;
const MAX_POINTS_PER_STROKE = 2_000;
const MAX_RESOURCE_ID_LENGTH = 180;
const MAX_COLOR_LENGTH = 32;

function emptyState(): ScratchPaperState {
  return { text: EMPTY_STATE.text, strokes: [], savedAt: EMPTY_STATE.savedAt };
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validUid(uid: string): boolean {
  return typeof uid === "string" && uid.trim().length > 0 && uid.length <= 180;
}

function validContext(context: ScratchPaperContext): boolean {
  return record(context)
    && (context.surface === "listen" || context.surface === "read" || context.surface === "exam")
    && typeof context.resourceId === "string"
    && context.resourceId.trim().length > 0
    && context.resourceId.length <= MAX_RESOURCE_ID_LENGTH;
}

function validPoint(value: unknown): value is ScratchPoint {
  return record(value)
    && typeof value.x === "number" && Number.isFinite(value.x) && value.x >= 0 && value.x <= 1
    && typeof value.y === "number" && Number.isFinite(value.y) && value.y >= 0 && value.y <= 1;
}

function validStroke(value: unknown): value is ScratchStroke {
  return record(value)
    && Array.isArray(value.points)
    && value.points.length > 0
    && value.points.length <= MAX_POINTS_PER_STROKE
    && value.points.every(validPoint)
    && typeof value.color === "string"
    && value.color.trim().length > 0
    && value.color.length <= MAX_COLOR_LENGTH
    && typeof value.width === "number"
    && Number.isFinite(value.width)
    && value.width > 0
    && value.width <= 64;
}

function validDraft(value: unknown): value is ScratchPaperDraft {
  return record(value)
    && typeof value.text === "string"
    && value.text.length <= MAX_TEXT_LENGTH
    && Array.isArray(value.strokes)
    && value.strokes.length <= MAX_STROKES
    && value.strokes.every(validStroke);
}

function validSavedAt(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function cloneDraft(draft: ScratchPaperDraft): ScratchPaperDraft {
  return {
    text: draft.text,
    strokes: draft.strokes.map((stroke) => ({
      color: stroke.color,
      width: stroke.width,
      points: stroke.points.map(({ x, y }) => ({ x, y })),
    })),
  };
}

function storageFromGlobal(): ScratchPaperStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageOrGlobal(storage?: ScratchPaperStorage): ScratchPaperStorage | null {
  return storage ?? storageFromGlobal();
}

function invalidRead(message: string): ScratchPaperRead {
  return { status: "invalid", state: emptyState(), message };
}

function invalidWrite(message: string): ScratchPaperWrite {
  return { status: "invalid", savedAt: null, message };
}

/** Return a stable key; question number and UI mode belong outside this context. */
export function scratchPaperStorageKey(uid: string, context: ScratchPaperContext): string {
  return `${SCRATCH_PAPER_PREFIX}:${encodeURIComponent(uid)}:${encodeURIComponent(context.surface)}:${encodeURIComponent(context.resourceId)}`;
}

export function loadScratchPaper(
  uid: string,
  context: ScratchPaperContext,
  storage?: ScratchPaperStorage,
): ScratchPaperRead {
  if (!validUid(uid) || !validContext(context)) return invalidRead("Chưa có ngữ cảnh giấy nháp hợp lệ.");
  const targetStorage = storageOrGlobal(storage);
  if (!targetStorage) return { status: "unavailable", state: emptyState(), message: "Thiết bị này không cho phép lưu giấy nháp." };
  let raw: string | null;
  try {
    raw = targetStorage.getItem(scratchPaperStorageKey(uid, context));
  } catch {
    return { status: "unavailable", state: emptyState(), message: "Không thể đọc giấy nháp trên thiết bị này." };
  }
  if (raw === null) return { status: "ready", state: emptyState(), message: "Giấy nháp sẽ tự lưu trên thiết bị này." };
  try {
    const value: unknown = JSON.parse(raw);
    const savedAt = record(value) ? value.savedAt : null;
    if (!record(value) || value.version !== SCRATCH_PAPER_VERSION || !validSavedAt(savedAt) || !validDraft(value)) throw new Error("Invalid scratch paper");
    const state: ScratchPaperState = { ...cloneDraft(value), savedAt };
    return { status: "ready", state, message: "Đã khôi phục giấy nháp trên thiết bị này." };
  } catch {
    return { status: "corrupt", state: emptyState(), message: "Giấy nháp cũ có dữ liệu không hợp lệ; dữ liệu cũ được giữ nguyên." };
  }
}

export function saveScratchPaper(
  uid: string,
  context: ScratchPaperContext,
  draft: ScratchPaperDraft,
  storage?: ScratchPaperStorage,
): ScratchPaperWrite {
  if (!validUid(uid) || !validContext(context)) return invalidWrite("Chưa có ngữ cảnh giấy nháp hợp lệ.");
  if (!validDraft(draft)) return invalidWrite("Nội dung giấy nháp không hợp lệ.");
  const targetStorage = storageOrGlobal(storage);
  if (!targetStorage) return { status: "unavailable", savedAt: null, message: "Thiết bị này không cho phép lưu giấy nháp." };
  // Never silently replace a payload we could not parse. The user can clear it
  // explicitly with clearScratchPaper after seeing the corruption message.
  const current = loadScratchPaper(uid, context, targetStorage);
  if (current.status === "corrupt") return { status: "corrupt", savedAt: null, message: current.message };
  if (current.status === "unavailable") return { status: "unavailable", savedAt: null, message: current.message };
  const savedAt = new Date().toISOString();
  const payload = { version: SCRATCH_PAPER_VERSION, savedAt, ...cloneDraft(draft) };
  try {
    targetStorage.setItem(scratchPaperStorageKey(uid, context), JSON.stringify(payload));
  } catch {
    return { status: "unavailable", savedAt: null, message: "Không thể lưu giấy nháp trên thiết bị này." };
  }
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent(SCRATCH_PAPER_EVENT, { detail: { uid, context } })); } catch { /* non-browser test/runtime */ }
  }
  return { status: "saved", savedAt, message: "Đã lưu giấy nháp trên thiết bị này." };
}

export function clearScratchPaper(
  uid: string,
  context: ScratchPaperContext,
  storage?: ScratchPaperStorage,
): ScratchPaperClear {
  if (!validUid(uid) || !validContext(context)) return { status: "invalid", message: "Chưa có ngữ cảnh giấy nháp hợp lệ." };
  const targetStorage = storageOrGlobal(storage);
  if (!targetStorage) return { status: "unavailable", message: "Thiết bị này không cho phép xoá giấy nháp." };
  let existing: string | null;
  try {
    existing = targetStorage.getItem(scratchPaperStorageKey(uid, context));
    if (existing === null) return { status: "missing", message: "Chưa có giấy nháp để xoá." };
    targetStorage.removeItem(scratchPaperStorageKey(uid, context));
  } catch {
    return { status: "unavailable", message: "Không thể xoá giấy nháp trên thiết bị này." };
  }
  if (typeof window !== "undefined") {
    try { window.dispatchEvent(new CustomEvent(SCRATCH_PAPER_EVENT, { detail: { uid, context, cleared: true } })); } catch { /* non-browser test/runtime */ }
  }
  return { status: "cleared", message: "Đã xoá giấy nháp của bài này." };
}

