"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isIos = useSyncExternalStore(
    () => () => undefined,
    () => isIosDevice() && !isStandalone(),
    () => false,
  );
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  async function install() {
    if (!deferredPrompt) {
      setShowInstructions(true);
      return;
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (!deferredPrompt && !isIos) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => void install()} className="inline-flex h-11 items-center rounded-xl border border-line bg-surface-soft px-3 text-xs font-extrabold text-ink transition-transform active:scale-[0.97]" aria-expanded={showInstructions}>
        Cài app
      </button>
      {showInstructions ? (
        <div className="absolute right-0 top-13 z-[60] w-72 rounded-2xl border border-line bg-surface p-4 text-left shadow-xl">
          <p className="text-sm font-extrabold text-ink">Cài ENGLISHGO trên iPhone</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">Trong Safari, chạm nút Chia sẻ rồi chọn “Thêm vào Màn hình chính”.</p>
          <button type="button" onClick={() => setShowInstructions(false)} className="mt-3 text-xs font-extrabold text-primary">Đã hiểu</button>
        </div>
      ) : null}
    </div>
  );
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
