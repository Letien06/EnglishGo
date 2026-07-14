"use client";

import AppErrorState from "@/components/AppErrorState";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorState onRetry={reset} homeHref="/" />;
}
