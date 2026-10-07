"use client";

import { useState } from "react";

export default function AdminGenerateForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        part: form.get("part"),
        topic: form.get("topic"),
        count: form.get("count"),
      }),
    });
    const result = await response.json();
    setMessage(response.ok && result.success ? `Đã đưa bản nháp vào hàng đợi: ${result.data.id}` : result.error || "Không thể đưa bản nháp vào hàng đợi");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="block text-sm font-semibold text-ink">
        Phần
        <select name="part" className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink">
          <option value="Part 1">Phần 1</option>
          <option value="Part 2">Phần 2</option>
          <option value="Part 5">Phần 5</option>
          <option value="Part 6">Phần 6</option>
          <option value="Part 7">Phần 7</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-ink">
        Chủ đề
        <input name="topic" required placeholder="Hợp đồng, du lịch, quy định văn phòng" className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Số lượng
        <input name="count" type="number" min={1} max={10} defaultValue={5} className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <button className="px-4 py-2 rounded-lg bg-accent text-gold-ink text-sm font-semibold">Xem trước cấu trúc bản nháp</button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </form>
  );
}
