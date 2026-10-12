"use client";

import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
}

export default function StudySaveStatus({ pendingCount, isSaving, error, lastSavedAtMillis, retry, message = "", pendingLabel = "mục" }: {
  pendingCount: number; isSaving: boolean; error: string | null; lastSavedAtMillis?: number | null; retry: () => void; message?: string; pendingLabel?: string;
}) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const text = error || (pendingCount > 0
    ? !online ? `Chờ đồng bộ · ${pendingCount} ${pendingLabel} đang chờ lưu trên thiết bị. Sẽ tự lưu khi có mạng.`
      : isSaving ? `Đang đồng bộ ${pendingCount} ${pendingLabel}… · ${pendingCount} ${pendingLabel} đang chờ lưu`
        : `Chờ đồng bộ ${pendingCount} ${pendingLabel}…`
    : lastSavedAtMillis ? "Đã lưu" : message);
  return <div className="practice-save-status flex h-16 items-center justify-between gap-2 text-sm" role={text ? error ? "alert" : "status" : undefined} aria-live="polite">
    <span className="min-w-0 max-h-full overflow-y-auto">{text}</span>
    {(error || (pendingCount > 0 && !isSaving)) && <button type="button" onClick={retry} disabled={isSaving} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-bold text-ink disabled:opacity-50">Thử lưu lại</button>}
  </div>;
}
