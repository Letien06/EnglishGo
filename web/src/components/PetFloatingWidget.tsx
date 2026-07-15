"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { usePathname } from "next/navigation";
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

const HIDDEN_PREFIXES = ["/listen/practice", "/read/practice", "/practice/session"];
const PET_POSITION_KEY = "englishgo:pet-position:v1";
const SCREEN_EDGE = 12;

export default function PetFloatingWidget() {
  const pathname = usePathname();
  const [dashboard, setDashboard] = useState<PetDashboard | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const widgetRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

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
    if (!open || !position || !widgetRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (!widgetRef.current) return;
      const next = constrainPosition(position, widgetRef.current.getBoundingClientRect());
      if (next.x !== position.x || next.y !== position.y) {
        applyPosition(widgetRef.current, next);
        setPosition(next);
        savePosition(next);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, position]);

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || !dashboard) return null;
  const { profile, wallet } = dashboard;
  const nextProgress = profile.nextEvolutionCareXp
    ? Math.min(100, Math.round((profile.careXpTotal / profile.nextEvolutionCareXp) * 100))
    : 100;

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
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent<HTMLButtonElement>) {
    const activeDrag = dragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId || !widgetRef.current) return;
    const deltaX = event.clientX - activeDrag.startClientX;
    const deltaY = event.clientY - activeDrag.startClientY;
    if (!activeDrag.moved && Math.hypot(deltaX, deltaY) < 5) return;
    activeDrag.moved = true;
    const next = constrainPosition(
      { x: activeDrag.origin.x + deltaX, y: activeDrag.origin.y + deltaY },
      widgetRef.current.getBoundingClientRect(),
    );
    activeDrag.position = next;
    applyPosition(widgetRef.current, next);
    setIsDragging(true);
    setOpen(false);
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const activeDrag = dragRef.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsDragging(false);
    if (!activeDrag.moved) return;
    suppressClickRef.current = true;
    setPosition(activeDrag.position);
    savePosition(activeDrag.position);
  }

  function toggleOpen() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  const widgetStyle: CSSProperties | undefined = position
    ? { left: `${position.x}px`, top: `${position.y}px`, right: "auto", bottom: "auto" }
    : undefined;

  return (
    <aside
      ref={widgetRef}
      style={widgetStyle}
      className={`pet-floating-widget ${open ? "is-open" : ""} ${isDragging ? "is-dragging" : ""}`}
      aria-label="Mèo đồng hành"
    >
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
        title="Kéo để di chuyển · Bấm để mở Mèo đồng hành"
        onPointerDown={beginDrag}
        onPointerMove={drag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={toggleOpen}
        className="pet-floating-trigger"
      >
        <PetCat mood={profile.mood} stage={profile.evolutionStage} compact />
        <span className="pet-floating-coin">{wallet.balance}</span>
      </button>
    </aside>
  );
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
  element.style.left = `${position.x}px`;
  element.style.top = `${position.y}px`;
  element.style.right = "auto";
  element.style.bottom = "auto";
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
    // Storage can be blocked without making the cat impossible to move.
  }
}
