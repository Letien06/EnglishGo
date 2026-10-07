"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { invalidateLearningLevels } from "./client-learning-progress-cache";

export type ReadingProgressAction = {
  part: number;
  level: number;
  testId?: string;
  itemId: string;
  questionId: string;
  selectedAnswer: string;
  correctAnswer: string;
  modeUsed: "normal" | "bilingual";
  assistPercent: number;
  elapsedSeconds: number;
};
type Entry = { requestId: string; queuedAt: number; action: ReadingProgressAction };
type Snapshot = { pending: readonly ReadingProgressAction[]; pendingCount: number; error: string | null; isSaving: boolean };
const EMPTY: Snapshot = Object.freeze({ pending: Object.freeze([]), pendingCount: 0, error: null, isSaving: false });
const queues = new Map<string, ReadingQueue>();
let activeUid: string | undefined;
let owner: ReadingQueue | undefined;
const TIMEOUT = 15_000;

function validEntry(value: unknown): value is Entry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Entry;
  const a = entry.action;
  return typeof entry.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.requestId)
    && Number.isSafeInteger(entry.queuedAt) && entry.queuedAt >= 0
    && Boolean(a) && Number.isInteger(a.part) && a.part >= 5 && a.part <= 7
    && Number.isInteger(a.level) && a.level >= 1 && a.level <= 4
    && (a.testId === undefined || (typeof a.testId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(a.testId)))
    && typeof a.itemId === "string" && Boolean(a.itemId)
    && typeof a.questionId === "string" && Boolean(a.questionId)
    && /^[A-D]$/.test(a.selectedAnswer) && /^[A-D]$/.test(a.correctAnswer)
    && (a.modeUsed === "normal" || a.modeUsed === "bilingual")
    && Number.isFinite(a.assistPercent) && a.assistPercent >= 0 && a.assistPercent <= 100
    && Number.isFinite(a.elapsedSeconds) && a.elapsedSeconds >= 0;
}

class ReadingQueue {
  readonly key: string;
  readonly listeners = new Set<() => void>();
  entries: Entry[] = [];
  unsaved = new Map<string, Entry>();
  snapshot = EMPTY;
  users = 0;
  attempts = 0;
  blocked = false;
  storageError: string | null = null;
  requestError: string | null = null;
  timer: ReturnType<typeof setTimeout> | undefined;
  controller: AbortController | undefined;

  constructor(readonly uid: string) {
    this.key = `englishgo:reading-progress-queue:${encodeURIComponent(uid)}`;
    try {
      this.entries = this.readStored();
      if (localStorage.getItem(this.key)) {
        for (const entry of this.entries) this.unsaved.set(entry.requestId, entry);
        this.persist();
        if (!this.unsaved.size && !this.storageError) localStorage.removeItem(this.key);
      }
    } catch {
      this.storageError = "Không thể khôi phục các câu chờ lưu trên thiết bị này.";
    }
    this.publish();
  }
  readStored(): Entry[] {
    const raw = localStorage.getItem(this.key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const legacy: unknown = Array.isArray(parsed) ? parsed.map((entry, index) => ({ ...entry, queuedAt: entry.queuedAt ?? index })) : parsed;
    if (!Array.isArray(legacy) || !legacy.every(validEntry)) throw new Error("Invalid saved queue");
    const entries = new Map<string, Entry>(legacy.map((entry) => [entry.requestId, entry]));
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(`${this.key}:`)) continue;
      const entry: unknown = JSON.parse(localStorage.getItem(key)!);
      if (!validEntry(entry)) throw new Error("Invalid saved queue");
      entries.set(entry.requestId, entry);
    }
    return [...entries.values()].sort((a, b) => a.queuedAt - b.queuedAt || a.requestId.localeCompare(b.requestId));
  }
  eligible = () => this.users > 0 && activeUid === this.uid;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  publish() {
    this.snapshot = Object.freeze({ pending: Object.freeze(this.entries.map((entry) => Object.freeze({ ...entry.action }))), pendingCount: this.entries.length, error: this.storageError ?? this.requestError, isSaving: owner === this });
    this.listeners.forEach((listener) => listener());
  }
  persist(acknowledgedRequestId?: string) {
    try {
      if (acknowledgedRequestId) this.unsaved.delete(acknowledgedRequestId);
      for (const entry of this.unsaved.values()) {
        localStorage.setItem(`${this.key}:${entry.requestId}`, JSON.stringify(entry));
        this.unsaved.delete(entry.requestId);
      }
      if (acknowledgedRequestId) localStorage.removeItem(`${this.key}:${acknowledgedRequestId}`);
      this.reconcile();
      this.storageError = null;
    } catch {
      this.storageError = "Không thể lưu trên thiết bị. Hãy giữ trang mở và thử lưu lại.";
    }
  }
  reconcile() {
    const merged = new Map(this.readStored().map((entry) => [entry.requestId, entry]));
    for (const entry of this.unsaved.values()) merged.set(entry.requestId, entry);
    this.entries = [...merged.values()].sort((a, b) => a.queuedAt - b.queuedAt || a.requestId.localeCompare(b.requestId));
  }
  activate = () => {
    activeUid = this.uid;
    this.users++;
    try { this.reconcile(); } catch { /* Existing unsaved answers remain available. */ }
    this.publish();
    if (this.users === 1) {
      window.addEventListener("online", this.retry);
      window.addEventListener("focus", this.retry);
      window.addEventListener("storage", this.onStorage);
      document.addEventListener("visibilitychange", this.onVisible);
      this.blocked = false;
    }
    this.schedule(0);
    return () => {
      this.users--;
      if (this.users) return;
      window.removeEventListener("online", this.retry);
      window.removeEventListener("focus", this.retry);
      window.removeEventListener("storage", this.onStorage);
      document.removeEventListener("visibilitychange", this.onVisible);
      if (activeUid === this.uid) activeUid = undefined;
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.controller?.abort();
    };
  };
  onVisible = () => { if (document.visibilityState === "visible") this.retry(); };
  onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== this.key && !event.key.startsWith(`${this.key}:`)) return;
    try { this.reconcile(); } catch { this.storageError = "Không thể khôi phục các câu chờ lưu trên thiết bị này."; }
    this.publish();
    this.schedule(0);
  };
  enqueue = (action: ReadingProgressAction) => {
    if (!this.eligible()) return;
    try { this.reconcile(); } catch { /* Keep unsaved actions when storage is unavailable. */ }
    const entry = { requestId: crypto.randomUUID(), queuedAt: Math.max(Date.now(), ...this.entries.map((entry) => entry.queuedAt + 1)), action: { ...action } };
    this.unsaved.set(entry.requestId, entry);
    this.entries.push(entry);
    this.persist();
    this.publish();
    this.schedule(0);
  };
  retry = () => {
    if (!this.eligible()) return;
    this.blocked = false;
    this.attempts = 0;
    this.requestError = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.persist();
    this.publish();
    this.schedule(0);
  };
  schedule(delay: number) {
    if (!this.eligible() || this.blocked || owner || this.timer || !this.entries.length || navigator.onLine === false) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.send(); }, delay);
  }
  async send() {
    if (!this.eligible() || this.blocked || owner || !this.entries.length) return;
    try { this.reconcile(); } catch { /* Send in-memory answers if storage is unavailable. */ }
    if (!this.entries.length) { this.publish(); return; }
    const entry = this.entries[0];
    // The global owner serializes requests across queue instances and hook mounts.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    owner = this;
    const controller = new AbortController();
    this.controller = controller;
    this.publish();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let delay = 0;
    try {
      const request = (async () => {
        const response = await fetch("/api/reading/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...entry.action, requestId: entry.requestId, expectedUid: this.uid, answeredAtMillis: entry.queuedAt }), signal: controller.signal });
        if (response.status === 401 || response.status === 403) this.blocked = true;
        if (!response.ok) {
          if (response.status !== 408 && response.status !== 429 && response.status < 500) this.blocked = true;
          throw new Error("Reading save failed");
        }
        return await response.json() as { success?: boolean; data?: { saved?: boolean; authenticated?: boolean; uid?: string; requestId?: string } };
      })();
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error("Reading save timed out")); }, TIMEOUT);
      });
      const body = await Promise.race([request, deadline]);
      if (controller.signal.aborted || !this.eligible()) return;
      if (!body?.success || !body.data?.saved || !body.data.authenticated || body.data.uid !== this.uid || body.data.requestId !== entry.requestId) {
        if (body?.data?.authenticated === false || (body?.data?.uid && body.data.uid !== this.uid)) this.blocked = true;
        throw new Error("Reading save not acknowledged");
      }
      this.entries = this.entries.filter((pending) => pending.requestId !== entry.requestId);
      this.attempts = 0;
      this.requestError = null;
      this.persist(entry.requestId);
      invalidateLearningLevels("reading", [entry.action.part], this.uid);
    } catch {
      if (this.eligible()) {
        this.requestError = this.blocked ? "Chưa lưu được. Hãy kiểm tra phiên đăng nhập và thử lưu lại." : "Chưa đồng bộ được. Các câu đang chờ sẽ được thử lưu lại.";
        delay = Math.min(60_000, 1000 * 2 ** Math.min(this.attempts++, 6));
      }
    } finally {
      if (timeout) clearTimeout(timeout);
      this.controller = undefined;
      owner = undefined;
      this.publish();
      for (const queue of queues.values()) queue.schedule(queue === this ? delay : 0);
    }
  }
}

export function useReadingProgressQueue(uid: string | null | undefined, authenticated = true) {
  const queue = useMemo(() => uid && authenticated && typeof window !== "undefined" ? queues.get(uid) ?? (() => { const next = new ReadingQueue(uid); queues.set(uid, next); return next; })() : undefined, [uid, authenticated]);
  useEffect(() => queue?.activate(), [queue]);
  const snapshot = useSyncExternalStore(queue?.subscribe ?? (() => () => {}), queue?.getSnapshot ?? (() => EMPTY), () => EMPTY);
  const enqueue = useCallback((action: ReadingProgressAction) => queue?.enqueue(action), [queue]);
  const retry = useCallback(() => queue?.retry(), [queue]);
  return { ...snapshot, enqueue, retry };
}
