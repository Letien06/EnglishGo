"use client";

import { useEffect } from "react";

export default function AppServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);
  }, []);

  return null;
}
