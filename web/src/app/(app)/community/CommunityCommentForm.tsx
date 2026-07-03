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
      setStatus(result.error || "Could not post comment");
      return;
    }
    setContent("");
    setStatus(null);
    router.refresh();
  }

  if (!signedIn) {
    return (
      <p className="text-sm text-muted mt-4">
        <Link href="/login" className="text-accent font-semibold">Sign in</Link> to comment.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="w-full min-h-24 px-3 py-2 rounded-lg bg-surface-soft border border-line text-ink"
        placeholder="Write a comment"
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void submit()} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">
          Post
        </button>
        {status && <span className="text-sm text-red-500">{status}</span>}
      </div>
    </div>
  );
}
