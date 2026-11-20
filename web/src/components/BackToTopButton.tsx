"use client";

import { useEffect, useState } from "react";

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setVisible(window.scrollY > 480);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Lên đầu trang"
      className="back-to-top-pill fixed bottom-20 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-line bg-glass/95 px-3.5 py-2 text-xs font-extrabold text-ink shadow-lg backdrop-blur-xl transition hover:border-primary hover:text-primary xl:bottom-6 xl:right-6"
    >
      <span aria-hidden="true">↑</span>
      <span>Đầu trang</span>
    </button>
  );
}
