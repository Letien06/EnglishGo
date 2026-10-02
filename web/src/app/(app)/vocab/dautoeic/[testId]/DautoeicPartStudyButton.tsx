"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClientRequestTimeoutError, fetchWithTimeout } from "@/lib/client-request";
import Link from "@/components/IntentLink";

interface Props {
  testId: string;
  partId: string;
  setId: number;
  ready?: boolean;
  tab?: "view" | "learn" | "play";
}

interface SyncResponse {
  success?: boolean;
  data?: { setId?: number };
  error?: { message?: string } | string | null;
}

type StudyState = "idle" | "syncing" | "navigating";

export default function DautoeicPartStudyButton({ testId, partId, setId, ready = false, tab }: Props) {
  const router = useRouter();
  const [state, setState] = useState<StudyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const loading = state !== "idle";
  const tabQuery = tab ? `&tab=${tab}` : "";
  const destination = `/vocab/${setId}/flashcards?mode=menu&partId=${encodeURIComponent(partId)}&mastery=all&order=random&amount=all${tabQuery}`;

  async function startStudy() {
    if (loading) return;

    setState("syncing");
    setError(null);

    try {
      const response = await fetchWithTimeout(
        `/api/dautoeic/vocab/tests/${encodeURIComponent(testId)}/sync?partId=${encodeURIComponent(partId)}`,
        { method: "POST" },
        10_000,
        { flow: "dautoeic_part_sync" },
      );
      const payload = (await response.json().catch(() => null)) as SyncResponse | null;
      if (!response.ok || payload?.success === false) {
        const message = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
        throw new Error(message || "Không nạp được bộ từ này.");
      }

      const syncedSetId = payload?.data?.setId ?? setId;
      setState("navigating");
      router.push(
        `/vocab/${syncedSetId}/flashcards?mode=menu&partId=${encodeURIComponent(partId)}&mastery=all&order=random&amount=all${tabQuery}`,
      );
    } catch (reason) {
      setState("idle");
      setError(
        reason instanceof ClientRequestTimeoutError
          ? "Mạng đang chậm. Không thể nạp Part trong 10 giây, hãy thử lại."
          : reason instanceof Error
            ? reason.message
            : "Không nạp được bộ từ này.",
      );
    }
  }

  if (ready) return (
    <Link href={destination} className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-success-line bg-success-soft px-4 py-2 text-xs font-extrabold text-success-ink">
      Vào học
    </Link>
  );

  return (
    <div className="mt-5 space-y-2">
      <button
        type="button"
        onClick={startStudy}
        disabled={loading}
        aria-describedby={error ? `part-study-error-${partId}` : undefined}
        className="inline-flex w-full items-center justify-center rounded-full border border-emerald-300 px-4 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-70"
      >
        {state === "syncing" ? "Đang chuẩn bị Part..." : state === "navigating" ? "Đang mở bài học..." : "Vào học"}
      </button>
      {error ? <p id={`part-study-error-${partId}`} role="alert" className="text-xs font-bold text-red-600">{error}</p> : null}
    </div>
  );
}
