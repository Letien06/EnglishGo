"use client";

import { useEffect } from "react";

/** Registers the offline shell only; learner data and test content are never cached here. */
export default function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).catch(() => undefined);
  }, []);
  return null;
}
