"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function CommunityCommentForm({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function submit() {
    const response = await fetch("/api/community/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setStatus(result.error || "Chưa gửi được bình luận.");
      return;
    }
    setContent("");
    setStatus(null);
    router.refresh();
  }

  if (!signedIn) {
    return (
      <p className="text-sm text-muted mt-4">
        <Link href="/login" className="text-primary-ink font-semibold">Đăng nhập</Link> để bình luận.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="w-full min-h-24 px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink"
        placeholder="Viết bình luận"
        aria-label="Bình luận của bạn"
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void submit()} className="px-4 py-2 rounded-lg bg-accent text-gold-ink text-sm font-semibold">
          Gửi bình luận
        </button>
        {status && <span className="text-sm text-danger-ink">{status}</span>}
      </div>
    </div>
  );
}
