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
    // Wait briefly so the current question finishes loading its own media first.
    const links: HTMLLinkElement[] = [];
    const preloadedImages: HTMLImageElement[] = [];
    const timer = window.setTimeout(() => {
      const upcoming = [session.items[index + 1], session.items[index + 2]].filter(Boolean);
      if (upcoming.length === 0) {
        const absoluteIndex = (session.windowOffset ?? 0) + index + 1;
        if (policy.route && session.windowOffset !== undefined && absoluteIndex < session.total) {
          const url = new URL(location.href);
          url.searchParams.set("q", String(absoluteIndex));
          // Test doubles and older Next router adapters may not expose prefetch.
          router.prefetch?.(`${url.pathname}${url.search}`);
        }
        return;
      }

      const imageUrls = new Set<string>();
      const audioUrls = new Set<string>();
      for (const next of upcoming) {
        const image = next.imageUrl || next.questions.find((question) => question.imageUrl)?.imageUrl;
        if (image) imageUrls.add(image);
      }
      if (policy.audio) {
        const firstNext = upcoming[0];
        const audio = firstNext.audioUrl || firstNext.questions.find((question) => question.audioUrl)?.audioUrl;
        if (audio) audioUrls.add(audio);
      }

      for (const url of imageUrls) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "image";
        link.href = url;
        link.fetchPriority = "low";
        document.head.appendChild(link);
        links.push(link);

        // Warm browser image decode cache so clicking Next paints in 0ms.
        const img = new window.Image();
        img.decoding = "async";
        img.src = url;
        preloadedImages.push(img);
      }

      for (const url of audioUrls) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "audio";
        link.href = url;
        link.fetchPriority = "low";
        document.head.appendChild(link);
        links.push(link);
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      links.forEach((link) => link.remove());
      preloadedImages.length = 0;
    };
  }, [session, index, router]);
  return null;
}
