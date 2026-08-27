"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { fetchWithTimeout } from "@/lib/client-request";
import PetCat from "./PetCat";
import type { PetDashboard } from "@/types/pet";

type ApiEnvelope<T> = { success: boolean; data: T | null; error: string | null };
type FloatingPosition = { x: number; y: number };
type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  origin: FloatingPosition;
  position: FloatingPosition;
  moved: boolean;
};

const PET_POSITION_KEY = "englishgo:pet-position:v1";
const SCREEN_EDGE = 12;
const PET_DASHBOARD_CACHE_TTL_MS = 30_000;
export const PET_PROFILE_UPDATED_EVENT = "englishgo:pet-profile-updated";

const dashboardCache: {
  value: PetDashboard | null;
  loadedAt: number;
  inFlight: Promise<PetDashboard | null> | null;
} = {
  value: null,
  loadedAt: 0,
  inFlight: null,
};

function cacheDashboard(dashboard: PetDashboard) {
  dashboardCache.value = dashboard;
  dashboardCache.loadedAt = Date.now();
}

async function getDashboard(force = false): Promise<PetDashboard | null> {
  if (!force && dashboardCache.value && Date.now() - dashboardCache.loadedAt < PET_DASHBOARD_CACHE_TTL_MS) {
    return dashboardCache.value;
  }
  if (dashboardCache.inFlight) return dashboardCache.inFlight;

  dashboardCache.inFlight = fetchWithTimeout("/api/pet", { cache: "no-store" }, 8_000)
    .then(async (response) => ({ response, body: await response.json() as ApiEnvelope<PetDashboard> }))
    .then(({ response, body }) => {
      if (!response.ok || !body.success || !body.data) return null;
      cacheDashboard(body.data);
      return body.data;
    })
    .catch(() => null)
    .finally(() => {
      dashboardCache.inFlight = null;
    });

  return dashboardCache.inFlight;
}

export default function PetFloatingWidget() {
  const [dashboard, setDashboard] = useState<PetDashboard | null>(dashboardCache.value);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const widgetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<FloatingPosition | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    let active = true;

    void getDashboard().then((nextDashboard) => {
      if (active && nextDashboard) setDashboard(nextDashboard);
    });

    function syncDashboard(event: Event) {
      const nextDashboard = (event as CustomEvent<PetDashboard | undefined>).detail;
      if (nextDashboard) {
        cacheDashboard(nextDashboard);
        setDashboard(nextDashboard);
        return;
      }
      void getDashboard(true).then((freshDashboard) => {
        if (active && freshDashboard) setDashboard(freshDashboard);
      });
    }

    window.addEventListener(PET_PROFILE_UPDATED_EVENT, syncDashboard);
    return () => {
      active = false;
      window.removeEventListener(PET_PROFILE_UPDATED_EVENT, syncDashboard);
    };
  }, []);

  useEffect(() => {
    const nextStatusChangeAtMillis = dashboard?.profile.nextStatusChangeAtMillis;
    if (!nextStatusChangeAtMillis) return;

    let active = true;
    const refreshStatus = () => {
      if (document.hidden) return;
      void getDashboard(true).then((nextDashboard) => {
        if (active && nextDashboard) setDashboard(nextDashboard);
      });
    };
    const delay = Math.max(0, nextStatusChangeAtMillis - Date.now()) + 500;
    const statusTimer = window.setTimeout(refreshStatus, delay);
    const refreshAfterReturn = () => {
      if (!document.hidden && Date.now() >= nextStatusChangeAtMillis) refreshStatus();
    };
    document.addEventListener("visibilitychange", refreshAfterReturn);

    return () => {
      active = false;
      window.clearTimeout(statusTimer);
      document.removeEventListener("visibilitychange", refreshAfterReturn);
    };
  }, [dashboard?.profile.nextStatusChangeAtMillis]);

  useEffect(() => {
    const saved = readSavedPosition();
    if (!saved) return;
    const frame = window.requestAnimationFrame(() => {
      setPosition(constrainPosition(saved, { width: 88, height: 88 }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function keepWidgetVisible() {
      if (!position || !widgetRef.current) return;
      const next = constrainPosition(position, widgetRef.current.getBoundingClientRect());
      if (next.x !== position.x || next.y !== position.y) {
        applyPosition(widgetRef.current, next);
        setPosition(next);
        savePosition(next);
      }
    }

    window.addEventListener("resize", keepWidgetVisible);
    return () => window.removeEventListener("resize", keepWidgetVisible);
  }, [position]);

  useEffect(() => {
    function syncVisibility() {
      setIsDocumentVisible(!document.hidden);
    }

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => () => {
    if (dragFrameRef.current != null) window.cancelAnimationFrame(dragFrameRef.current);
  }, []);

  if (!dashboard || !dashboard.profile.floatingEnabled) return null;
  const { profile, wallet } = dashboard;
  const nextProgress = profile.nextEvolutionCareXp
    ? Math.min(100, Math.round((profile.careXpTotal / profile.nextEvolutionCareXp) * 100))
    : 100;

  function queuePosition(nextPosition: FloatingPosition) {
    pendingPositionRef.current = nextPosition;
    if (dragFrameRef.current != null) return;

    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const pendingPosition = pendingPositionRef.current;
      pendingPositionRef.current = null;
      if (pendingPosition && widgetRef.current) applyPosition(widgetRef.current, pendingPosition);
    });
  }

  function flushPosition(): FloatingPosition | null {
    if (dragFrameRef.current != null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    const pendingPosition = pendingPositionRef.current;
    pendingPositionRef.current = null;
    if (pendingPosition && widgetRef.current) applyPosition(widgetRef.current, pendingPosition);
    return pendingPosition;
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary || !widgetRef.current) return;
    const rect = widgetRef.current.getBoundingClientRect();
    const origin = constrainPosition(position ?? { x: rect.left, y: rect.top }, rect);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin,
      position: origin,
      moved: false,
    };
    applyPosition(widgetRef.current, origin);
    setPosition(origin);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLButtonElement>) {
    const activeDrag = dragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId || !widgetRef.current) return;

    const deltaX = event.clientX - activeDrag.startClientX;
    const deltaY = event.clientY - activeDrag.startClientY;
    if (!activeDrag.moved && Math.hypot(deltaX, deltaY) < 5) return;

    if (!activeDrag.moved) {
      activeDrag.moved = true;
      setIsDragging(true);
      setOpen(false);
    }

    const nextPosition = constrainPosition(
      { x: activeDrag.origin.x + deltaX, y: activeDrag.origin.y + deltaY },
      widgetRef.current.getBoundingClientRect(),
    );
    activeDrag.position = nextPosition;
    queuePosition(nextPosition);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const activeDrag = dragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finalPosition = flushPosition() ?? activeDrag.position;
    dragRef.current = null;
    setIsDragging(false);
    if (!activeDrag.moved) return;

    suppressClickRef.current = true;
    setPosition(finalPosition);
    savePosition(finalPosition);
  }

  function toggleOpen() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  const widgetStyle: CSSProperties | undefined = position
    ? {
        left: "0px",
        top: "0px",
        right: "auto",
        bottom: "auto",
        transform: positionTransform(position),
      }
    : undefined;

  return (
    <aside
      ref={widgetRef}
      style={widgetStyle}
      className={`pet-floating-widget ${open ? "is-open" : ""} ${isDragging ? "is-dragging" : ""} ${isDocumentVisible ? "" : "is-paused"}`}
      aria-label="Thú cưng đồng hành"
    >
      {open ? (
        <div className="pet-floating-panel">
          <div className="flex items-start gap-3">
            <PetCat mood={profile.mood} stage={profile.evolutionStage} companionId={profile.equippedCompanionId} compact />
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
            <Link href="/pet" className="pet-widget-secondary">Nhà Pet</Link>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Đóng thú cưng đồng hành" : "Mở thú cưng đồng hành"}
        title="Kéo để di chuyển · Bấm để mở thú cưng đồng hành"
        onPointerDown={beginDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={toggleOpen}
        className="pet-floating-trigger"
      >
        <PetCat mood={profile.mood} stage={profile.evolutionStage} companionId={profile.equippedCompanionId} compact />
        <span className="pet-floating-coin">{wallet.balance}</span>
      </button>
    </aside>
  );
}

function positionTransform(position: FloatingPosition) {
  return `translate3d(${position.x}px, ${position.y}px, 0)`;
}

function constrainPosition(position: FloatingPosition, rect: Pick<DOMRect, "width" | "height">): FloatingPosition {
  const maxX = Math.max(SCREEN_EDGE, window.innerWidth - rect.width - SCREEN_EDGE);
  const maxY = Math.max(SCREEN_EDGE, window.innerHeight - rect.height - SCREEN_EDGE);
  return {
    x: Math.round(Math.max(SCREEN_EDGE, Math.min(maxX, position.x))),
    y: Math.round(Math.max(SCREEN_EDGE, Math.min(maxY, position.y))),
  };
}

function applyPosition(element: HTMLElement, position: FloatingPosition) {
  element.style.left = "0px";
  element.style.top = "0px";
  element.style.right = "auto";
  element.style.bottom = "auto";
  element.style.transform = positionTransform(position);
}

function readSavedPosition(): FloatingPosition | null {
  try {
    const raw = window.localStorage.getItem(PET_POSITION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<FloatingPosition>;
    return typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y)
      ? { x: value.x, y: value.y }
      : null;
  } catch {
    return null;
  }
}

function savePosition(position: FloatingPosition) {
  try {
    window.localStorage.setItem(PET_POSITION_KEY, JSON.stringify(position));
  } catch {
    // Storage can be blocked without making the pet impossible to move.
  }
}
