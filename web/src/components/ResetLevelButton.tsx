"use client";

import { useState } from "react";

interface Props {
  part: number;
  level: number;
  endpoint: string;
  onReset?: () => void | Promise<void>;
  grouped?: boolean;
}

export default function ResetLevelButton({ part, level, endpoint, onReset, grouped = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleClick = async () => {
    if (!confirm(grouped ? "Reset tiến độ nhóm luyện tập này?" : "Reset tiến độ level này?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ part, level }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || "Không thể reset tiến độ.");
      }
      await onReset?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể reset tiến độ.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-xs font-extrabold text-muted transition-colors hover:border-red-300 hover:text-red-500 disabled:opacity-50"
        title="Reset tiến độ"
      >
        {busy ? "Đang reset..." : "Reset"}
      </button>
      {error ? <small role="alert" className="max-w-40 text-right text-[10px] font-semibold text-red-600">{error}</small> : null}
    </span>
  );
}
