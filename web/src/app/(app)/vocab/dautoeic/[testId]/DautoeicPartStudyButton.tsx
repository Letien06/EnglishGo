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
  masteredWords?: number;
  wordCount?: number;
  partName?: string;
}

interface SyncResponse {
  success?: boolean;
  data?: { setId?: number };
  error?: { message?: string } | string | null;
}

type StudyState = "idle" | "syncing" | "navigating";

export default function DautoeicPartStudyButton({ testId, partId, setId, ready = false, tab, masteredWords, wordCount, partName }: Props) {
  const router = useRouter();
  const [state, setState] = useState<StudyState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [replayPromptOpen, setReplayPromptOpen] = useState(false);
  const loading = state !== "idle";
  const tabQuery = tab ? `&tab=${tab}` : "";
  const activityQuery = tab === "learn" || !tab ? "&intent=continue" : "";
  const destination = `/vocab/${setId}/flashcards?mode=menu&partId=${encodeURIComponent(partId)}&mastery=all&order=ordered&amount=all${tabQuery}${activityQuery}`;
  const replayDestination = `/vocab/${setId}/flashcards?mode=menu&partId=${encodeURIComponent(partId)}&mastery=all&order=ordered&amount=all${tabQuery}${tab === "learn" || !tab ? "&intent=review" : ""}`;
  const isCompleted = typeof masteredWords === "number" && typeof wordCount === "number" && wordCount > 0 && masteredWords >= wordCount;

  async function startStudy(replay = false) {
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
        `/vocab/${syncedSetId}/flashcards?mode=menu&partId=${encodeURIComponent(partId)}&mastery=all&order=ordered&amount=all${tabQuery}${replay ? (tab === "learn" || !tab ? "&intent=review" : "") : activityQuery}`,
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

  function beginStudy() {
    if (isCompleted) {
      setReplayPromptOpen(true);
      return;
    }
    if (ready) router.push(destination);
    else void startStudy();
  }

  function replayPart() {
    setReplayPromptOpen(false);
    if (ready) router.push(replayDestination);
    else void startStudy(true);
  }

  if (ready && !isCompleted) return (
    <Link href={destination} className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-success-line bg-success-soft px-4 py-2 text-xs font-extrabold text-success-ink">
      Vào học
    </Link>
  );

  if (ready) return (
    <>
      <button type="button" onClick={beginStudy} className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-success-line bg-success-soft px-4 py-2 text-xs font-extrabold text-success-ink">
        Vào học
      </button>
      {replayPromptOpen && <ReplayPrompt partName={partName ?? partId} wordCount={wordCount ?? 0} onClose={() => setReplayPromptOpen(false)} onConfirm={replayPart} />}
    </>
  );

  return (
    <div className="mt-5 space-y-2">
      <button
        type="button"
        onClick={beginStudy}
        disabled={loading}
        aria-describedby={error ? `part-study-error-${partId}` : undefined}
        className="inline-flex w-full items-center justify-center rounded-full border border-emerald-300 px-4 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-70"
      >
        {state === "syncing" ? "Đang chuẩn bị Part..." : state === "navigating" ? "Đang mở bài học..." : "Vào học"}
      </button>
      {error ? <p id={`part-study-error-${partId}`} role="alert" className="text-xs font-bold text-red-600">{error}</p> : null}
      {replayPromptOpen && <ReplayPrompt partName={partName ?? partId} wordCount={wordCount ?? 0} onClose={() => setReplayPromptOpen(false)} onConfirm={replayPart} />}
    </div>
  );
}

function ReplayPrompt({ partName, wordCount, onClose, onConfirm }: { partName: string; wordCount: number; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="replay-title">
      <section className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <h2 id="replay-title" className="text-lg font-extrabold text-ink">{partName} đã hoàn thành</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Bạn đã học thuộc {wordCount} từ. Bạn có muốn học lại toàn bộ {partName} không?</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink2">Để sau</button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-primary px-4 py-2 text-sm font-extrabold text-white">Học lại Part này</button>
        </div>
      </section>
    </div>
  );
}
