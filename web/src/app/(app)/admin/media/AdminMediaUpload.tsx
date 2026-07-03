"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminMediaUpload() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/media", {
      method: "POST",
      body: form,
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setMessage(result.error || "Upload failed");
      return;
    }
    setMessage("Upload complete.");
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <label className="block text-sm font-semibold text-ink">
        Media type
        <select name="mediaType" className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink">
          <option value="AUDIO">Audio MP3</option>
          <option value="IMAGE">Image JPG/PNG</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-ink">
        File
        <input name="file" type="file" required accept="audio/mpeg,audio/mp3,image/jpeg,image/png" className="mt-1 w-full text-sm text-ink" />
      </label>
      <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">Upload</button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </form>
  );
}
