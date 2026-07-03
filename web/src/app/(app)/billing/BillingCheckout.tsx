"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function BillingCheckout({ planId }: { planId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function checkout() {
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, provider: "manual" }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setStatus(result.error || "Checkout failed");
      return;
    }
    setStatus("Checkout saved.");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button type="button" onClick={() => void checkout()} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold">
        Checkout
      </button>
      {status && <p className="text-xs text-muted mt-2">{status}</p>}
    </div>
  );
}
