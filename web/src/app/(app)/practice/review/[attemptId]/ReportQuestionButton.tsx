"use client";

import { useState } from "react";

export default function ReportQuestionButton({ attemptId, questionId }: { attemptId: number; questionId: number }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function report() {
    const reason = window.prompt("Mô tả ngắn lỗi bạn gặp (tùy chọn):");
    if (reason === null) return;
    setStatus("loading");
    try {
      const response = await fetch("/api/content/question-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, questionId, reason }),
      });
      const result = await response.json() as { success?: boolean; error?: string; data?: { created?: boolean } };
      if (!response.ok || !result.success) throw new Error(result.error || "Không thể gửi báo lỗi.");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="mt-3 text-xs font-bold text-jade">Đã gửi báo lỗi để đội ngũ xem xét.</p>;
  }

  return (
    <div className="mt-4 flex items-center gap-3">
      <button type="button" onClick={() => void report()} disabled={status === "loading"} className="text-xs font-extrabold text-muted underline decoration-dotted underline-offset-4 hover:text-ink disabled:opacity-60">
        {status === "loading" ? "Đang gửi…" : "Báo lỗi câu hỏi"}
      </button>
      {status === "error" ? <span className="text-xs font-bold text-terracotta">Chưa gửi được, hãy thử lại.</span> : null}
    </div>
  );
}
