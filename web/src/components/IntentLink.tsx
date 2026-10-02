"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

const warmed = new Map<string, number>();

export default function IntentLink({ onMouseEnter, onFocus, prefetch = false, ...props }: ComponentProps<typeof Link>) {
  const router = useRouter();
  const warm = () => {
    if (typeof props.href !== "string" || !props.href.startsWith("/") || props.href.startsWith("//")) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || ["2g", "slow-2g"].includes(connection?.effectiveType ?? "")) return;
    if (Date.now() - (warmed.get(props.href) ?? 0) < 30_000) return;
    if (warmed.size >= 32) warmed.delete(warmed.keys().next().value!);
    warmed.set(props.href, Date.now());
    router.prefetch(props.href);
  };
  return <Link {...props} prefetch={prefetch} onMouseEnter={(event) => { onMouseEnter?.(event); warm(); }} onFocus={(event) => { onFocus?.(event); warm(); }} />;
}
