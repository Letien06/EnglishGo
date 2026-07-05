"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReviewBackGuard() {
  const router = useRouter();

  useEffect(() => {
    window.history.replaceState({ practiceReview: true }, "", window.location.href);
    window.history.pushState({ practiceReviewSentinel: true }, "", window.location.href);

    const onPopState = () => {
      router.replace("/practice");
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [router]);

  return null;
}
