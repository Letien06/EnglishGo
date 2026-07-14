"use client";

import AppErrorState from "@/components/AppErrorState";

export default function AppErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppErrorState title="Không thể tải khu vực học này" onRetry={reset} />;
}
