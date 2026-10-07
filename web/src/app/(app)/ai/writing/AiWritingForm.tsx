"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AiWritingForm() {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/ai/writing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: form.get("prompt"),
        responseText: form.get("responseText"),
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setStatus(result.error || "Chưa gửi được bài viết.");
      return;
    }
    setStatus("Đã lưu phản hồi.");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="block text-sm font-semibold text-ink">
        Đề bài
        <input name="prompt" required className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Bài viết của bạn
        <textarea name="responseText" required className="mt-1 w-full min-h-48 px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <button className="px-4 py-2 rounded-lg bg-accent text-gold-ink text-sm font-semibold">Nhận phản hồi</button>
      {status && <p className="text-sm text-muted">{status}</p>}
    </form>
  );
}
