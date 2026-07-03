"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLogout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      router.push("/login");
    }
  }, [router]);

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="px-3 py-1.5 rounded-lg border border-line text-sm font-medium text-ink2 hover:text-ink hover:bg-surface-soft transition-colors disabled:opacity-50"
      data-logout-button
    >
      {busy ? "..." : "Đăng xuất"}
    </button>
  );
}
