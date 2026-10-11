"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DauToeicPracticeItem } from "@/types/dautoeic";

export function usePracticeResume({ skill, uid, part, level, testId, items, setAnswers, setIndex, pendingAnswers, currentAnswers, currentIndex }: {
  skill: "listening" | "reading";
  uid: string | null;
  part: number;
  level: number;
  testId?: string;
  items: DauToeicPracticeItem[];
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  setIndex: Dispatch<SetStateAction<number>>;
  pendingAnswers?: Record<string, string>;
  currentAnswers?: Record<string, string>;
  currentIndex?: number;
}) {
  const interacted = useRef(false);
  const explicitPosition = useRef(typeof window !== "undefined" && new URLSearchParams(window.location.search).has("q"));
  const localAnswers = useRef<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const storageKey = `englishgo:practice-position:${JSON.stringify([uid ?? "guest", skill, part, testId ?? level, items[0]?.id])}`;
  const pendingRef = useRef(pendingAnswers);
  useEffect(() => { pendingRef.current = pendingAnswers; }, [pendingAnswers]);
  const [status, setStatus] = useState(uid ? "Đang khôi phục tiến độ... Bạn có thể học ngay." : "");
  const markInteraction = useCallback(() => { interacted.current = true; }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (saved && saved.answers && typeof saved.answers === "object") {
        const answers: Record<string, string> = {};
        for (const item of items) for (const question of item.questions) {
          const answer = saved.answers[question.id];
          if (typeof answer === "string" && /^[A-D]$/.test(answer)) answers[question.id] = answer;
        }
        localAnswers.current = answers;
        setAnswers((previous) => ({ ...answers, ...previous }));
        const index = items.findIndex((item) => item.id === saved.itemId);
        if (index >= 0 && !explicitPosition.current && !interacted.current) setIndex(index);
      }
    } catch { /* Server history and the durable queue remain available. */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [storageKey, items, setAnswers, setIndex]);

  useEffect(() => {
    if (!hydrated || !currentAnswers || currentIndex === undefined) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ answers: currentAnswers, itemId: items[currentIndex]?.id }));
    } catch { /* The answer queue reports storage failures separately. */ }
  }, [hydrated, currentAnswers, currentIndex, items, storageKey]);

  useEffect(() => {
    if (!uid) return;
    const controller = new AbortController();
    const selection = testId ? `testId=${encodeURIComponent(testId)}` : `level=${level}`;
    void fetch(`/api/${skill}/progress?part=${part}&${selection}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success || payload.data?.uid !== uid) throw new Error("History unavailable");
        if (controller.signal.aborted) return;
        const saved = payload.data.answers;
        const answers: Record<string, string> = {};
        for (const item of items) {
          for (const question of item.questions) {
            const answer = pendingRef.current?.[question.id] ?? saved?.[question.id] ?? localAnswers.current[question.id];
            if (typeof answer === "string" && /^[A-D]$/.test(answer.trim().toUpperCase())) answers[question.id] = answer.trim().toUpperCase();
          }
        }
        setAnswers((current) => ({ ...answers, ...current }));
        if (!interacted.current && !explicitPosition.current && Object.keys(localAnswers.current).length === 0 && Object.keys(answers).length > 0) {
          const next = items.findIndex((item) => item.questions.some((question) => !answers[question.id]));
          if (next >= 0) setIndex(next);
        }
        setStatus("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("Chưa tải được tiến độ cũ. Câu trả lời mới vẫn được lưu khi có kết nối.");
      });
    return () => controller.abort();
  }, [items, level, part, testId, setAnswers, setIndex, skill, uid]);

  return { markInteraction, resumeStatus: status };
}
