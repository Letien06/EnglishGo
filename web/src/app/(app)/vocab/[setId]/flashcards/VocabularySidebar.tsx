"use client";

import { useEffect, useState } from "react";
import type { DauToeicVocabPartSummary } from "@/types/dautoeic";
import { fetchWithTimeout } from "@/lib/client-request";
import styles from "./vocabulary.module.css";

export default function VocabularySidebar({ testId, partId, title, count, tab, ready = false, onNavigate }: {
  testId?: string; partId?: string; title: string; count: number;
  tab: "view" | "learn" | "play"; ready?: boolean; onNavigate: (href: string) => void;
}) {
  const [parts, setParts] = useState<DauToeicVocabPartSummary[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!testId) return;
    const controller = new AbortController();
    void fetchWithTimeout(`/api/dautoeic/vocab/tests/${encodeURIComponent(testId)}`, { signal: controller.signal }, 8_000)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success || !Array.isArray(payload.data?.parts)) throw new Error("Parts unavailable");
        if (!controller.signal.aborted) setParts(payload.data.parts);
      }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [testId]);
  return <aside className={styles.sidebar} aria-label="Các phần từ vựng">
    <button className={styles.backLink} onClick={() => onNavigate("/vocab?tab=learn")}>← Thư viện từ vựng</button>
    <span className={styles.eyebrow}>BỘ TỪ ĐANG HỌC</span>
    <h1>{title}</h1>
    <p>{parts.length ? `${parts.length} phần · ${parts.reduce((sum, part) => sum + part.wordCount, 0)} từ` : `${count} từ sẵn sàng`}</p>
    <nav>{parts.map((part, index) => <button key={part.id} aria-label={`${part.name} · ${part.wordCount} từ`} aria-current={part.id === partId ? "page" : undefined} disabled={!part.wordCount} onClick={() => {
      if (part.id !== partId) onNavigate(ready ? `/vocab/${part.internalSetId}/flashcards?mode=menu&tab=${tab}&partId=${encodeURIComponent(part.id)}&mastery=all&order=ordered&amount=all` : `/vocab/dautoeic/${encodeURIComponent(testId!)}?tab=${tab}`);
    }}><span>{index + 1}</span><strong>{part.name}</strong><small>{part.wordCount}</small></button>)}</nav>
    {testId && !parts.length && <p className="text-xs" role="status">{failed ? "Chưa tải được các phần. Bạn vẫn học được bộ hiện tại." : "Đang tải danh sách phần..."}</p>}
    <div className={styles.sidebarTip}><strong>Mỗi ngày một chút</strong><p>Xem từ → học trong câu → chơi để nhớ lâu.</p></div>
  </aside>;
}
