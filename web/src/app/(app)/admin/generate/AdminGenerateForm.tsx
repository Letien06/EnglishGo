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
    setMessage(response.ok && result.success ? `Draft queued: ${result.data.id}` : result.error || "Failed to queue draft");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="block text-sm font-semibold text-ink">
        Part
        <select name="part" className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink">
          <option>Part 1</option>
          <option>Part 2</option>
          <option>Part 5</option>
          <option>Part 6</option>
          <option>Part 7</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-ink">
        Topic
        <input name="topic" required placeholder="Contracts, travel, office policy" className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Count
        <input name="count" type="number" min={1} max={10} defaultValue={5} className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink" />
      </label>
      <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Preview draft schema</button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </form>
  );
}
