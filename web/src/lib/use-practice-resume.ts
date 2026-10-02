"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DauToeicPracticeItem } from "@/types/dautoeic";

export function usePracticeResume({ skill, uid, part, level, items, setAnswers, setIndex }: {
  skill: "listening" | "reading";
  uid: string | null;
  part: number;
  level: number;
  items: DauToeicPracticeItem[];
  setAnswers: Dispatch<SetStateAction<Record<string, string>>>;
  setIndex: Dispatch<SetStateAction<number>>;
}) {
  const interacted = useRef(false);
  const [status, setStatus] = useState(uid ? "Đang khôi phục tiến độ... Bạn có thể học ngay." : "");
  const markInteraction = useCallback(() => { interacted.current = true; }, []);

  useEffect(() => {
    if (!uid) return;
    const controller = new AbortController();
    void fetch(`/api/${skill}/progress?part=${part}&level=${level}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success || payload.data?.uid !== uid) throw new Error("History unavailable");
        if (controller.signal.aborted) return;
        const saved = payload.data.answers;
        const answers: Record<string, string> = {};
        for (const item of items) {
          for (const question of item.questions) {
            const answer = saved?.[question.id];
            if (typeof answer === "string" && /^[A-D]$/.test(answer.trim().toUpperCase())) answers[question.id] = answer.trim().toUpperCase();
          }
        }
        setAnswers((current) => ({ ...answers, ...current }));
        if (!interacted.current && Object.keys(answers).length > 0) {
          const next = items.findIndex((item) => item.questions.some((question) => !answers[question.id]));
          if (next >= 0) setIndex(next);
        }
        setStatus("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("Chưa tải được tiến độ cũ. Câu trả lời mới vẫn được lưu khi có kết nối.");
      });
    return () => controller.abort();
  }, [items, level, part, setAnswers, setIndex, skill, uid]);

  return { markInteraction, resumeStatus: status };
}
