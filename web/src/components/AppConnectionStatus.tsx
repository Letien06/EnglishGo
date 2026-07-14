"use client";

import { useEffect, useRef, useState } from "react";

export default function AppConnectionStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const [notice, setNotice] = useState<"online" | "offline" | null>(() =>
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : null,
  );
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const update = (nextOnline: boolean) => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      setOnline(nextOnline);
      setNotice(nextOnline ? "online" : "offline");
      if (nextOnline) {
        dismissTimer.current = setTimeout(() => setNotice(null), 5000);
      }
    };

    const onOnline = () => update(true);
    const onOffline = () => update(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!notice) return null;

  return (
    <div
      className={`app-connection-status ${online ? "is-online" : "is-offline"}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className="app-connection-status-dot" />
      {online
        ? "Đã có kết nối. Những thay đổi đang chờ sẽ được đồng bộ."
        : "Bạn đang ngoại tuyến. Tiến trình trên thiết bị này vẫn được lưu."}
    </div>
  );
}
