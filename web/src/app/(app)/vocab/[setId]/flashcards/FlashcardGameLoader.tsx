"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const FlashcardGame = dynamic(() => import("./FlashcardGame"), {
  loading: () => <div role="status" className="grid min-h-[50vh] place-items-center rounded-2xl border border-line bg-surface p-8 text-muted">Đang mở bộ học…</div>,
});

export default function FlashcardGameLoader(props: ComponentProps<typeof import("./FlashcardGame").default>) {
  return <FlashcardGame {...props} />;
}
