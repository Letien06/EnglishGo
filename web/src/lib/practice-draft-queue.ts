"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { fetchWithTimeout } from "./client-request";
import { practiceDraftKey } from "./practice-draft-storage";

type Config = { uid: string; sessionKey: string; testId: number; mode: string; parts: number[]; durationMinutes: number; startedAtMillis: number };
type Mutation = { requestId: string; revision: number; payload: string; currentQuestionIndex: number };
type Snapshot = { pendingCount: number; isSaving: boolean; error: string | null; lastSavedAt: number | null };
const EMPTY: Snapshot = { pendingCount: 0, isSaving: false, error: null, lastSavedAt: null };

/** One full snapshot supersedes older unsent snapshots of the same exam run. */
export class PracticeDraftQueue {
  readonly prefix: string;
  private entries = new Map<string, Mutation>();
  private owned = new Set<string>();
  private snapshot: Snapshot = EMPTY;
  private listeners = new Set<() => void>();
  private active = false;
  private paused = false;
  private blocked = false;
  private attempt = 0;
  private revision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight: Promise<boolean> | null = null;
  private controller?: AbortController;
  private storageError: string | null = null;
  private requestError: string | null = null;
  private lastSavedAt: number | null = null;
  private retryAfterMs = 0;

  constructor(readonly config: Config) {
    this.prefix = `practice-pending:${encodeURIComponent(config.uid)}:${config.sessionKey}:${config.startedAtMillis}:`;
  }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  private publish() {
    this.snapshot = { pendingCount: this.entries.size, isSaving: this.inFlight !== null, error: this.storageError ?? this.requestError, lastSavedAt: this.lastSavedAt };
    this.listeners.forEach(fn => fn());
  }
  private restore() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(this.prefix)) continue;
        const saved: Mutation = JSON.parse(localStorage.getItem(key)!);
        if (typeof saved.requestId !== "string" || key !== this.prefix + saved.requestId || !Number.isSafeInteger(saved.revision) || typeof saved.payload !== "string" || !Number.isInteger(saved.currentQuestionIndex)) continue;
        const payload = JSON.parse(saved.payload);
        if (payload.ownerUid !== this.config.uid || payload.startedAtMillis !== this.config.startedAtMillis) continue;
        this.entries.set(saved.requestId, saved);
        this.revision = Math.max(this.revision, saved.revision);
      }
    } catch { this.storageError = "Không đọc được bản nháp trên thiết bị. Hãy giữ trang mở."; }
  }
  activate = () => {
    this.active = true;
    this.restore();
    this.publish();
    window.addEventListener("online", this.retry);
    window.addEventListener("focus", this.retry);
    window.addEventListener("storage", this.onStorage);
    document.addEventListener("visibilitychange", this.onVisible);
    this.schedule(0);
    return () => {
      this.active = false;
      clearTimeout(this.timer);
      this.controller?.abort();
      window.removeEventListener("online", this.retry);
      window.removeEventListener("focus", this.retry);
      window.removeEventListener("storage", this.onStorage);
      document.removeEventListener("visibilitychange", this.onVisible);
    };
  };
  private onStorage = (event: StorageEvent) => { if (event.key?.startsWith(this.prefix)) { this.restore(); this.publish(); this.schedule(0); } };
  private onVisible = () => { if (!document.hidden) this.retry(); };
  retry = () => { this.blocked = false; this.attempt = 0; this.requestError = null; this.restore(); this.publish(); this.schedule(0); };
  enqueue = (payload: string, currentQuestionIndex: number) => {
    if (this.paused) return;
    try {
      const previous = JSON.parse(localStorage.getItem(practiceDraftKey(this.config.uid, this.config.sessionKey)) || "{}");
      if (Number.isSafeInteger(previous.updatedAtMillis)) this.revision = Math.max(this.revision, previous.updatedAtMillis);
    } catch { /* In-memory ordering still works if storage is unavailable. */ }
    const revision = Math.max(Date.now(), this.revision + 1);
    this.revision = revision;
    const ownedPayload = JSON.stringify({ ...JSON.parse(payload), ownerUid: this.config.uid, startedAtMillis: this.config.startedAtMillis, updatedAtMillis: revision });
    const entry: Mutation = { requestId: crypto.randomUUID(), revision, payload: ownedPayload, currentQuestionIndex };
    this.entries.set(entry.requestId, entry);
    this.owned.add(entry.requestId);
    try {
      // Persist the mutation before returning control to the learner.
      localStorage.setItem(this.prefix + entry.requestId, JSON.stringify(entry));
      localStorage.setItem(practiceDraftKey(this.config.uid, this.config.sessionKey), ownedPayload);
      for (const id of this.owned) {
        if (id === entry.requestId) continue;
        localStorage.removeItem(this.prefix + id);
        this.entries.delete(id);
        this.owned.delete(id);
      }
      this.storageError = null;
    } catch { this.storageError = "Chưa lưu được trên thiết bị. Giữ trang mở và thử lưu lại."; }
    // Full payloads make unsent intermediate keystrokes redundant. Never
    // discard another tab's snapshot until the server acknowledges ours.
    this.publish();
    this.schedule(1500);
  };
  private schedule(delay: number) {
    clearTimeout(this.timer);
    if (!this.active || this.paused || this.blocked || !this.entries.size || !navigator.onLine) return;
    this.timer = setTimeout(() => void this.flush(), delay);
  }
  flush = async (): Promise<boolean> => {
    clearTimeout(this.timer);
    if (this.inFlight) { await this.inFlight; return !this.entries.size; }
    if (!this.active || this.paused || this.blocked || !navigator.onLine) return !this.entries.size;
    this.restore();
    const entry = [...this.entries.values()].sort((a, b) => b.revision - a.revision || b.requestId.localeCompare(a.requestId))[0];
    if (!entry) return true;
    this.controller = new AbortController();
    this.inFlight = this.send(entry, this.controller.signal);
    this.publish();
    try { return await this.inFlight; }
    finally { this.inFlight = null; this.publish(); this.schedule(this.attempt ? Math.max(this.retryAfterMs, Math.min(60_000, 2000 * 2 ** Math.min(this.attempt - 1, 5))) : 1500); }
  };
  private async send(entry: Mutation, signal: AbortSignal): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(`/api/practice/tests/${this.config.testId}/draft`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ ...entry, expectedUid: this.config.uid, runStartedAtMillis: this.config.startedAtMillis, mode: this.config.mode, parts: this.config.parts, durationMinutes: this.config.durationMinutes }),
      }, 15_000);
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        this.retryAfterMs = Number.isFinite(retryAfter) ? Math.min(300_000, Math.max(0, retryAfter * 1000)) : 0;
        this.blocked = [400, 401, 403, 409].includes(response.status);
        throw new Error(result?.error || "Chưa lưu được bài. Bản nháp đang chờ đồng bộ.");
      }
      for (const [id, value] of this.entries) {
        if (value.revision < entry.revision || (value.revision === entry.revision && id <= entry.requestId)) {
          localStorage.removeItem(this.prefix + id);
          this.entries.delete(id);
          this.owned.delete(id);
        }
      }
      this.attempt = 0;
      this.retryAfterMs = 0;
      this.requestError = null;
      this.storageError = null;
      this.lastSavedAt = Date.now();
      return !this.entries.size;
    } catch (error) {
      this.attempt++;
      this.requestError = error instanceof Error ? error.message : "Chưa đồng bộ được bản nháp.";
      return false;
    }
  }
  /** Stop and settle network writes before submit/reset; old runs are fenced on the server too. */
  pause = async () => { this.paused = true; clearTimeout(this.timer); await this.inFlight; };
  resume = () => { this.paused = false; this.schedule(0); };
  complete = () => {
    this.paused = true;
    clearTimeout(this.timer);
    try {
      for (const id of this.entries.keys()) localStorage.removeItem(this.prefix + id);
      localStorage.removeItem(practiceDraftKey(this.config.uid, this.config.sessionKey));
    } catch { /* A stale run can never recreate a submitted server draft. */ }
    this.entries.clear(); this.publish();
  };
}

export function usePracticeDraftQueue(config: Config) {
  const parts = config.parts.join(",");
  const { uid, sessionKey, testId, mode, durationMinutes, startedAtMillis } = config;
  const queue = useMemo(() => new PracticeDraftQueue({ uid, sessionKey, testId, mode, durationMinutes, startedAtMillis, parts: parts.split(",").map(Number) }),
    [uid, sessionKey, testId, mode, durationMinutes, startedAtMillis, parts]);
  useEffect(() => queue.activate(), [queue]);
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, () => EMPTY);
  return { ...snapshot, enqueue: queue.enqueue, retry: queue.retry, flush: queue.flush, pause: queue.pause, resume: queue.resume, complete: queue.complete };
}
