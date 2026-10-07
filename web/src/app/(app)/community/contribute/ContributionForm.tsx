"use client";

import { useState } from "react";

export default function ContributionForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/community/contributions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        content: form.get("content"),
        sourceNote: form.get("sourceNote") || null,
        ownsRights: form.get("ownsRights") === "on",
      }),
    });
    const result = await response.json();
    setMessage(response.ok && result.success ? "Đã gửi nội dung để xét duyệt." : result.error || "Chưa gửi được nội dung.");
    if (response.ok && result.success) event.currentTarget.reset();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="block text-sm font-semibold text-ink">
        Tiêu đề
        <input name="title" required className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Nội dung
        <textarea name="content" required className="mt-1 w-full min-h-40 px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Ghi chú nguồn
        <input name="sourceNote" className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input name="ownsRights" type="checkbox" required />
        Tôi có quyền chia sẻ nội dung này.
      </label>
      <button className="px-4 py-2 rounded-lg bg-accent text-gold-ink text-sm font-semibold">Gửi nội dung</button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </form>
  );
}
