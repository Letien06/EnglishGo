"use client";

import { useEffect } from "react";
import { publishStudyStreak, studyDateKey, type StudyStreakSnapshot } from "@/lib/client-study-streak-cache";
import { publishOnlinePresence } from "@/lib/client-online-presence";

type PresenceSnapshot = StudyStreakSnapshot & { onlineSecondsToday: number; totalOnlineSeconds: number; ownsSession: boolean };
type Heartbeat = { sessionId: string; sequence: number; elapsedSeconds: number; active: boolean; dateKey: string };

export default function StudyOnlineTracker({ uid }: { uid: string | null }) {
  useEffect(() => {
    if (!uid) return;
    const sessionId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, digit => (Number(digit) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(digit) / 4).toString(16));
    let sequence = 0;
    let disposed = false;
    let day = studyDateKey();
    let lastTick = performance.now();
    let lastWall = Date.now();
    let active = document.visibilityState === "visible" && navigator.onLine;
    let ownsSession = false;
    let synced = false;
    let seconds = 0;
    let totalSeconds = 0;
    let elapsed = 0;
    let pending: Heartbeat | null = null;
    let pendingDay = day;
    let inFlight = false;
    let reachedGoal = false;
    const show = () => {
      const waiting = pendingDay === day ? pending?.elapsedSeconds ?? 0 : 0;
      if (!disposed) publishOnlinePresence(uid, { dateKey: day, seconds: seconds + elapsed + waiting, totalSeconds: totalSeconds + elapsed + waiting, running: active && ownsSession, synced });
    };
    const tick = () => {
      const now = performance.now();
      const wall = Date.now();
      const nextDay = studyDateKey();
      const gap = Math.max(now - lastTick, wall - lastWall);
      if (nextDay !== day) { day = nextDay; seconds = 0; elapsed = 0; reachedGoal = false; }
      else if (active && ownsSession && gap >= 0 && gap <= 5000) elapsed = Math.min(60, elapsed + gap / 1000);
      lastTick = now;
      lastWall = wall;
      show();
    };
    const sync = async () => {
      if (inFlight || !navigator.onLine) return;
      inFlight = true;
      // Retrying the same sequence makes a lost response safe to replay.
      if (!pending) { pending = { sessionId, sequence: ++sequence, elapsedSeconds: elapsed, active, dateKey: day }; pendingDay = day; elapsed = 0; }
      const sent = pending;
      const sentDay = pendingDay;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch("/api/study/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sent), keepalive: true, signal: controller.signal });
        const body = await response.json() as { success?: boolean; data?: PresenceSnapshot };
        if (!response.ok || !body.success || !body.data) throw new Error("Presence unavailable");
        pending = null;
        if (disposed) return;
        const data = body.data;
        if (data.todayDateKey !== studyDateKey()) return;
        if (!ownsSession || !data.ownsSession || sentDay !== data.todayDateKey) elapsed = 0;
        day = data.todayDateKey;
        seconds = data.onlineSecondsToday;
        totalSeconds = data.totalOnlineSeconds;
        ownsSession = data.ownsSession;
        synced = true;
        reachedGoal = seconds >= 600;
        publishStudyStreak(uid, data);
        show();
      } catch {
        synced = false;
        ownsSession = false;
        elapsed = 0;
        show();
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        if (pending === null && sent.active !== active) void sync();
      }
    };
    const onVisibility = () => {
      tick();
      active = document.visibilityState === "visible" && navigator.onLine;
      show();
      void sync();
    };
    const onPageHide = () => { tick(); active = false; void sync(); };
    const ticks = window.setInterval(() => {
      tick();
      if (active && ownsSession && !reachedGoal && seconds + elapsed >= 600) { reachedGoal = true; void sync(); }
    }, 1000);
    const heartbeat = window.setInterval(() => { tick(); if (active || pending) void sync(); }, 30000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);
    window.addEventListener("offline", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onVisibility);
    void sync();
    return () => {
      tick(); active = false; disposed = true;
      void sync();
      window.clearInterval(ticks);
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
      window.removeEventListener("offline", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [uid]);
  return null;
}
