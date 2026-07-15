"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PetCat from "./PetCat";
import type { PetDashboard } from "@/types/pet";

type ApiEnvelope<T> = { success: boolean; data: T | null; error: string | null };

const HIDDEN_PREFIXES = ["/listen/practice", "/read/practice", "/practice/session"];

export default function PetFloatingWidget() {
  const pathname = usePathname();
  const [dashboard, setDashboard] = useState<PetDashboard | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;
    let active = true;
    void fetch("/api/pet", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as ApiEnvelope<PetDashboard> }))
      .then(({ response, body }) => {
        if (active && response.ok && body.success && body.data) setDashboard(body.data);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [pathname]);

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || !dashboard) return null;
  const { profile, wallet } = dashboard;
  const nextProgress = profile.nextEvolutionCareXp
    ? Math.min(100, Math.round((profile.careXpTotal / profile.nextEvolutionCareXp) * 100))
    : 100;

  return (
    <aside className={`pet-floating-widget ${open ? "is-open" : ""}`} aria-label="Mèo đồng hành">
      {open ? (
        <div className="pet-floating-panel">
          <div className="flex items-start gap-3">
            <PetCat mood={profile.mood} stage={profile.evolutionStage} compact />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <strong className="truncate text-sm text-ink">{profile.name}</strong>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary">Lv.{profile.evolutionStage}</span>
              </div>
              <p className="mt-0.5 truncate text-xs font-semibold text-muted">{profile.evolutionName}</p>
              <div className="mt-2 flex gap-2 text-[11px] font-extrabold">
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">🪙 {wallet.balance}</span>
                <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-800">♥ {profile.fullness}</span>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[10px] font-bold text-muted"><span>Tiến hoá</span><span>{profile.careXpTotal}{profile.nextEvolutionCareXp ? `/${profile.nextEvolutionCareXp}` : ""}</span></div>
            <div className="pet-progress"><span style={{ width: `${nextProgress}%` }} /></div>
          </div>
          <div className="mt-3 flex gap-2">
            <Link href="/pet?tab=inventory" className="pet-widget-primary">Cho ăn</Link>
            <Link href="/pet" className="pet-widget-secondary">Nhà Mèo</Link>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Đóng Mèo đồng hành" : "Mở Mèo đồng hành"}
        onClick={() => setOpen((value) => !value)}
        className="pet-floating-trigger"
      >
        <PetCat mood={profile.mood} stage={profile.evolutionStage} compact />
        <span className="pet-floating-coin">{wallet.balance}</span>
      </button>
    </aside>
  );
}
