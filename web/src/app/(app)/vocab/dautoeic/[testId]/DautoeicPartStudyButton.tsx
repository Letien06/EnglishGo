"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  testId: string;
  partId: string;
  setId: number;
}

interface SyncResponse {
  success?: boolean;
  data?: {
    setId?: number;
  };
  error?: {
    message?: string;
  } | string | null;
}

export default function DautoeicPartStudyButton({ testId, partId, setId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startStudy() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/dautoeic/vocab/tests/${encodeURIComponent(testId)}/sync?partId=${encodeURIComponent(partId)}`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as SyncResponse | null;
      if (!response.ok || payload?.success === false) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : payload?.error?.message;
        throw new Error(message || "Không nạp được bộ từ này.");
      }
      const syncedSetId = payload?.data?.setId ?? setId;
      router.push(
        `/vocab/${syncedSetId}/flashcards?mode=menu&partId=${encodeURIComponent(partId)}&mastery=all&order=random&amount=all`,
      );
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Không nạp được bộ từ này.");
    }
  }

  return (
    <div className="mt-5 space-y-2">
      <button
        type="button"
        onClick={startStudy}
        disabled={loading}
        data-overdelay="Đang nạp từ Dautoeic..."
        data-overdelay-timeout="7000"
        className="inline-flex w-full items-center justify-center rounded-full border border-emerald-300 px-4 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? "Đang nạp từ..." : "Vào học"}
      </button>
      {error ? <p className="text-xs font-bold text-red-600">{error}</p> : null}
    </div>
  );
}
