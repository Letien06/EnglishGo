"use client";

import { useEffect, useState } from "react";
import type { DauToeicVocabPartSummary } from "@/types/dautoeic";
import { fetchWithTimeout } from "@/lib/client-request";
import DautoeicPartStudyButton from "./DautoeicPartStudyButton";

export default function DautoeicPartsClient({ testId, parts, ready }: {
  testId: string; parts: DauToeicVocabPartSummary[]; ready: boolean;
}) {
  const [progress, setProgress] = useState<DauToeicVocabPartSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetchWithTimeout(`/api/dautoeic/vocab/tests/${encodeURIComponent(testId)}`, { signal: controller.signal, cache: "no-store" }, 8_000)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success || !Array.isArray(payload.data?.parts)) throw new Error("Progress unavailable");
        if (!controller.signal.aborted) setProgress(payload.data.parts);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [testId]);

  return <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {parts.map((part) => {
      const current = progress?.find((item) => item.id === part.id);
      const percent = current && part.wordCount > 0 ? Math.min(100, Math.round(current.masteredWords / part.wordCount * 100)) : 0;
      return <article key={part.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-lg font-extrabold text-ink">{part.name}</h2>
        <p className="mt-2 text-sm text-muted">{part.wordCount} từ vựng</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-soft">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-muted" aria-live="polite">
          {current ? <><span>{current.masteredWords}/{part.wordCount} từ đã thuộc</span>{current.dueWords > 0 && <span className="text-danger-ink">{current.dueWords} cần ôn</span>}</>
            : <span>{failed ? "Chưa tải được tiến độ. Bạn vẫn có thể vào học." : "Đang tải tiến độ..."}</span>}
        </div>
        <DautoeicPartStudyButton testId={testId} partId={part.id} setId={part.internalSetId} ready={ready} />
      </article>;
    })}
  </section>;
}
