"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const SAMPLE_PROMPTS = [
  {
    label: "Email phản hồi khách hàng (Part 2)",
    prompt:
      "Respond to a customer email asking about a delayed shipment. Explain the reason for the delay, provide a new delivery date, and offer a discount code for their next order.",
  },
  {
    label: "Email đề xuất đổi lịch họp (Part 2)",
    prompt:
      "Write an email to your team manager requesting to reschedule Friday's project review meeting to Monday morning, give two reasons, and ask if the new time works.",
  },
  {
    label: "Bài luận Làm việc từ xa (Part 3)",
    prompt:
      "Do you agree or disagree that remote work increases employee productivity more than working in a traditional office? Give specific reasons and examples to support your opinion.",
  },
];

export default function AiWritingForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [responseText, setResponseText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const stats = useMemo(() => {
    const trimmed = responseText.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const sentences = trimmed ? trimmed.split(/[.!?]+/).filter((s) => s.trim()).length : 0;
    return { words, sentences };
  }, [responseText]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const response = await fetch("/api/ai/writing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, responseText }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        setStatus({ text: result.error || "Chưa gửi được bài viết.", error: true });
        return;
      }
      setStatus({ text: "Đã chấm xong và lưu phản hồi bên dưới!" });
      setPrompt("");
      setResponseText("");
      router.refresh();
    } catch {
      setStatus({ text: "Không thể kết nối máy chủ. Vui lòng thử lại.", error: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Chọn nhanh đề mẫu TOEIC Writing</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SAMPLE_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setPrompt(item.prompt)}
              className="rounded-full border border-line bg-surface-soft px-3 py-1.5 text-xs font-bold text-ink transition hover:border-primary hover:text-primary"
            >
              + {item.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-sm font-semibold text-ink">
        Đề bài
        <input
          name="prompt"
          required
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Nhập đề bài hoặc bấm chọn một đề mẫu ở trên..."
          className="mt-1 w-full rounded-lg border border-line bg-surface-soft px-3 py-2 text-ink"
        />
      </label>

      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="ai-writing-response" className="text-sm font-semibold text-ink">
            Bài viết của bạn
          </label>
          <span className="text-xs font-bold tabular-nums text-muted">
            {stats.words} từ · {stats.sentences} câu
          </span>
        </div>
        <textarea
          id="ai-writing-response"
          name="responseText"
          required
          value={responseText}
          onChange={(event) => setResponseText(event.target.value)}
          placeholder="Viết đoạn trả lời hoặc bài luận tiếng Anh của bạn tại đây..."
          className="mt-1 min-h-48 w-full rounded-lg border border-line bg-surface-soft px-3 py-2 text-ink"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-extrabold text-gold-ink disabled:opacity-50"
        >
          {submitting ? "Đang chấm bài với AI..." : "Nhận phản hồi"}
        </button>
        {status && (
          <p className={`text-sm font-semibold ${status.error ? "text-red-600" : "text-emerald-600"}`}>
            {status.text}
          </p>
        )}
      </div>
    </form>
  );
}
