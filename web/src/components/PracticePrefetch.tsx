"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PracticeWindowSession } from "@/lib/practice-window";
import { prefetchPolicy } from "@/lib/practice-prefetch";

export default function PracticePrefetch({ session, index }: { session: PracticeWindowSession; index: number }) {
  const router = useRouter();
  useEffect(() => {
    const policy = prefetchPolicy(navigator.onLine, (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number; rtt?: number } }).connection);
    if (!policy.enabled) return;
    // Wait until the current question has had time to load its own media.
    const links: HTMLLinkElement[] = [];
    const timer = window.setTimeout(() => {
    const next = session.items[index + 1];
    if (!next) {
      const absoluteIndex = (session.windowOffset ?? 0) + index + 1;
      if (policy.route && session.windowOffset !== undefined && absoluteIndex < session.total) {
        const url = new URL(location.href); url.searchParams.set("q", String(absoluteIndex));
        // Test doubles and older Next router adapters may not expose prefetch.
        router.prefetch?.(`${url.pathname}${url.search}`);
      }
      return;
    }
    const image = next.imageUrl || next.questions.find((question) => question.imageUrl)?.imageUrl;
    const audio = policy.audio ? next.audioUrl || next.questions.find((question) => question.audioUrl)?.audioUrl : null;
    const urls = new Set([image, audio].filter((value): value is string => Boolean(value)));
    for (const url of urls) {
      const link = document.createElement("link");
      link.rel = "prefetch"; link.href = url; link.fetchPriority = "low";
      document.head.appendChild(link); links.push(link);
    }
    }, 800);
    return () => { window.clearTimeout(timer); links.forEach((link) => link.remove()); };
  }, [session, index, router]);
  return null;
}
