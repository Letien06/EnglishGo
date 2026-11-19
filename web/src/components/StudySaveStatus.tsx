"use client";

import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
}

/**
 * Floating, zero-CLS save-status indicator.
 * Never reserves vertical document flow above the practice workspace so
 * switching from `StudyLoading` to the interactive client causes 0px shift.
 */
export default function StudySaveStatus({ pendingCount, isSaving, error, lastSavedAtMillis, retry, message = "", pendingLabel = "mục" }: {
  pendingCount: number; isSaving: boolean; error: string | null; lastSavedAtMillis?: number | null; retry: () => void; message?: string; pendingLabel?: string;
}) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const text = error || (pendingCount > 0
    ? !online ? `Chờ đồng bộ · ${pendingCount} ${pendingLabel} đang chờ lưu trên thiết bị. Sẽ tự lưu khi có mạng.`
      : isSaving ? `Đang đồng bộ ${pendingCount} ${pendingLabel}… · ${pendingCount} ${pendingLabel} đang chờ lưu`
        : `Chờ đồng bộ ${pendingCount} ${pendingLabel}…`
    : lastSavedAtMillis ? "Đã lưu" : message);

  if (!text) return null;

  const urgent = Boolean(error || pendingCount > 0);
  return (
    <div
      className={`practice-save-status pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[min(calc(100vw-2rem),28rem)] items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md transition-opacity duration-200 ${
        error
          ? "border-danger-line bg-danger-soft/95 text-danger-ink"
          : urgent
            ? "border-warning-line bg-surface/95 text-ink"
            : "border-line bg-surface/90 text-ink3"
      }`}
      role={error ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="min-w-0 truncate">{text}</span>
      {(error || (pendingCount > 0 && !isSaving)) && (
        <button
          type="button"
          onClick={retry}
          disabled={isSaving}
          className="pointer-events-auto shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink disabled:opacity-50"
        >
          Thử lưu lại
        </button>
      )}
    </div>
  );
}
