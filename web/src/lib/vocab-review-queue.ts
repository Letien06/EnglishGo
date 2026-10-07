"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

export type QueuedVocabReview = { wordId: number; mastered?: true; quality?: number };
type Entry = { token: string; review: QueuedVocabReview };
type Batch = { requestId: string; entries: Entry[] };
type Snapshot = {
  pendingReviews: QueuedVocabReview[];
  pendingCount: number;
  error: string | null;
  isSaving: boolean;
  masteryByWordId: ReadonlyMap<number, boolean>;
};
const EMPTY: Snapshot = { pendingReviews: [], pendingCount: 0, error: null, isSaving: false, masteryByWordId: new Map() };
Object.freeze(EMPTY.pendingReviews);
Object.freeze(EMPTY);
const queues = new Map<string, ReviewQueue>();
let activeUid: string | undefined;
let inFlightOwner: { queue: ReviewQueue } | undefined;
const identifier = () => crypto.randomUUID();
const REQUEST_TIMEOUT_MS = 15000;

class ReviewQueue {
  readonly key: string;
  readonly listeners = new Set<() => void>();
  pending = new Map<number, Entry>();
  acknowledgedMastery = new Map<number, boolean>();
  batch: Batch | undefined;
  snapshot: Snapshot = EMPTY;
  users = 0;
  attempts = 0;
  authBlocked = false;
  storageError: string | null = null;
  requestError: string | null = null;
  timer: ReturnType<typeof setTimeout> | undefined;
  request: Promise<void> | undefined;

  constructor(readonly uid: string) {
    this.key = `englishgo:vocab-review-queue:${encodeURIComponent(uid)}`;
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const saved = JSON.parse(raw) as { pending: Entry[]; batch?: Batch };
        if (!Array.isArray(saved.pending)) throw new Error("Invalid queue");
        for (const entry of saved.pending) {
          if (!entry.token || !Number.isInteger(entry.review?.wordId)) throw new Error("Invalid review");
          this.pending.set(entry.review.wordId, entry);
        }
        if (saved.batch?.requestId && Array.isArray(saved.batch.entries)) this.batch = saved.batch;
      }
    } catch {
      this.storageError = "Không thể khôi phục tiến độ đã chờ lưu trên thiết bị này.";
    }
    this.publish();
  }

  eligible = () => this.users > 0 && activeUid === this.uid;
  activate = () => {
    if (!this.users) {
      this.authBlocked = false;
      window.addEventListener("online", this.onOnline);
    }
    activeUid = this.uid;
    this.users++;
    this.schedule(100);
    return () => {
      this.users--;
      if (!this.users) {
        window.removeEventListener("online", this.onOnline);
        if (activeUid === this.uid) activeUid = undefined;
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
      }
    };
  };
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  publish() {
    const masteryByWordId = new Map(this.acknowledgedMastery);
    for (const { review } of this.pending.values()) {
      if (review.mastered) masteryByWordId.set(review.wordId, true);
      else if (review.quality !== undefined && review.quality < 3) masteryByWordId.set(review.wordId, false);
    }
    const pendingReviews = [...this.pending.values()].map(({ review }) => Object.freeze({ ...review }));
    Object.freeze(pendingReviews);
    this.snapshot = Object.freeze({
      pendingReviews,
      pendingCount: this.pending.size,
      error: this.storageError ?? this.requestError,
      isSaving: inFlightOwner?.queue === this,
      masteryByWordId,
    });
    this.listeners.forEach((listener) => listener());
  }
  persist() {
    try {
      localStorage.setItem(this.key, JSON.stringify({ pending: [...this.pending.values()], batch: this.batch }));
      this.storageError = null;
    } catch {
      this.storageError = "Không thể lưu tiến độ chờ đồng bộ trên thiết bị. Hãy giữ trang mở và thử lại.";
    }
  }
  enqueue = (review: QueuedVocabReview) => {
    if (!this.eligible()) return;
    this.pending.set(review.wordId, { token: identifier(), review: { ...review } });
    this.persist();
    this.publish();
    this.schedule(100);
  };
  schedule(delay: number) {
    if (!this.eligible() || this.authBlocked || this.timer || inFlightOwner || !this.pending.size) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.request = this.sendBatch();
    }, delay);
  }
  retry = () => {
    if (!this.eligible()) return;
    this.attempts = 0;
    this.authBlocked = false;
    this.requestError = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.persist();
    this.publish();
    this.schedule(0);
  };
  onOnline = () => {
    if (!this.authBlocked) this.retry();
  };
  reconcile = (words: { id: number; mastered?: boolean }[]) => {
    let changed = false;
    for (const word of words) {
      if (this.acknowledgedMastery.has(word.id) && this.acknowledgedMastery.get(word.id) === Boolean(word.mastered)) {
        this.acknowledgedMastery.delete(word.id);
        changed = true;
      }
    }
    if (changed) this.publish();
  };
  flush = async (): Promise<boolean> => {
    if (!this.eligible() || this.authBlocked) return this.pending.size === 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    while (this.pending.size && this.eligible()) {
      if (inFlightOwner && inFlightOwner.queue !== this) return false;
      if (inFlightOwner?.queue === this) await this.request;
      else {
        this.requestError = null;
        this.request = this.sendBatch();
        await this.request;
      }
      if (this.requestError) return false;
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
    }
    return this.pending.size === 0;
  };
  async sendBatch() {
    if (!this.eligible() || this.authBlocked || inFlightOwner || !this.pending.size) return;
    this.batch ??= { requestId: identifier(), entries: [...this.pending.values()].slice(0, 100) };
    const batch = this.batch;
    this.persist();
    inFlightOwner = { queue: this };
    this.publish();
    let retryDelay: number | undefined;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const body = JSON.stringify({ requestId: batch.requestId, reviews: batch.entries.map(({ review }) => review) });
      const request = (async () => {
        const response = await fetch("/api/vocab/reviews/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
          // Fetch survives navigation without a second unload request.
          keepalive: new TextEncoder().encode(body).byteLength < 60000,
        });
        if (controller.signal.aborted) throw new Error("Review request timed out");
        if (!response.ok) {
          if (response.status === 401) this.authBlocked = true;
          const transient = response.status === 408 || response.status === 429 || response.status >= 500;
          throw Object.assign(new Error("Save failed"), { transient });
        }
        return await response.json() as unknown;
      })();
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Review request timed out"));
        }, REQUEST_TIMEOUT_MS);
      });
      const envelope = await Promise.race([request, deadline]) as { success?: boolean; data?: { reviews?: { wordId: number; newStatus: string }[] } } | null;
      const reviews = envelope?.data?.reviews;
      const expectedWordIds = new Set(batch.entries.map((entry) => entry.review.wordId));
      if (envelope?.success !== true || !Array.isArray(reviews) || reviews.length !== expectedWordIds.size) {
        throw new Error("Missing review acknowledgements");
      }
      const acknowledgements = new Map<number, string>();
      for (const review of reviews) {
        if (!review || !expectedWordIds.has(review.wordId) || acknowledgements.has(review.wordId)
          || !["NEW", "LEARNING", "REVIEWING", "MASTERED"].includes(review.newStatus)) {
          throw new Error("Invalid review acknowledgements");
        }
        acknowledgements.set(review.wordId, review.newStatus);
      }
      for (const entry of batch.entries) {
        this.acknowledgedMastery.set(entry.review.wordId, acknowledgements.get(entry.review.wordId) === "MASTERED");
        if (this.pending.get(entry.review.wordId)?.token === entry.token) this.pending.delete(entry.review.wordId);
      }
      this.batch = undefined;
      this.attempts = 0;
      this.requestError = null;
      this.persist();
      retryDelay = 100;
    } catch (error) {
      this.requestError = "Tiến độ chưa đồng bộ. Bạn có thể tiếp tục học hoặc thử lưu lại.";
      const transient = !(error instanceof Error && "transient" in error) || Boolean((error as Error & { transient: boolean }).transient);
      if (transient && this.attempts < 5) retryDelay = Math.min(500 * 2 ** this.attempts++, 30000);
    } finally {
      if (timeout) clearTimeout(timeout);
      inFlightOwner = undefined;
      this.publish();
      if (retryDelay !== undefined) this.schedule(retryDelay);
      // Account switches never dispatch work for the previous account.
      if (activeUid !== this.uid && activeUid) queues.get(activeUid)?.schedule(100);
    }
  }
}

function queueFor(uid: string) {
  let queue = queues.get(uid);
  if (!queue) {
    queue = new ReviewQueue(uid);
    queues.set(uid, queue);
  }
  return queue;
}

const emptySnapshot = () => EMPTY;
const noSubscribe = () => () => {};

export function useVocabReviewQueue(uid: string | undefined, enabled: boolean) {
  const queue = useMemo(() => enabled && uid && typeof window !== "undefined" ? queueFor(uid) : undefined, [uid, enabled]);
  const snapshot = useSyncExternalStore(queue?.subscribe ?? noSubscribe, queue?.getSnapshot ?? emptySnapshot, emptySnapshot);
  useEffect(() => {
    if (!queue) return;
    return queue.activate();
  }, [queue]);
  const enqueue = useCallback((review: QueuedVocabReview) => queue?.enqueue(review), [queue]);
  const retry = useCallback(() => queue?.retry(), [queue]);
  const reconcile = useCallback((words: { id: number; mastered?: boolean }[]) => queue?.reconcile(words), [queue]);
  const flush = useCallback(() => queue?.flush() ?? Promise.resolve(true), [queue]);
  return { ...snapshot, enqueue, retry, reconcile, flush };
}
