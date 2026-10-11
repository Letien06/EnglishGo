"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PracticeWindowSession } from "@/lib/practice-window";

export default function PracticePrefetch({ session, index }: { session: PracticeWindowSession; index: number }) {
  const router = useRouter();
  useEffect(() => {
    if (navigator.onLine === false || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const next = session.items[index + 1];
    if (!next) {
      const absoluteIndex = (session.windowOffset ?? 0) + index + 1;
      if (session.windowOffset !== undefined && absoluteIndex < session.total) {
        const url = new URL(location.href); url.searchParams.set("q", String(absoluteIndex));
        // Test doubles and older Next router adapters may not expose prefetch.
        router.prefetch?.(`${url.pathname}${url.search}`);
      }
      return;
    }
    const urls = new Set([next.imageUrl, next.audioUrl, ...next.questions.flatMap((question) => [question.imageUrl, question.audioUrl])].filter((value): value is string => Boolean(value)));
    const links = [...urls].slice(0, 4).map((url) => {
      const link = document.createElement("link");
      link.rel = "prefetch"; link.href = url; document.head.appendChild(link); return link;
    });
    return () => links.forEach((link) => link.remove());
  }, [session, index, router]);
  return null;
}
