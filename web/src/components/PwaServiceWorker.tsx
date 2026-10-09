"use client";

import { useEffect } from "react";

/** Registers the offline shell and the safe public content cache. */
export default function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "development";
    void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`, {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => undefined);
  }, []);
  return null;
}
