import { AsyncLocalStorage } from "node:async_hooks";

type RequestMetrics = { requestId: string; firestoreMs: number; firestoreReads: number; firestoreBytes: number };
const storage = new AsyncLocalStorage<RequestMetrics>();

export function runRequestMetrics<T>(requestId: string, fn: () => Promise<T>) {
  return storage.run({ requestId, firestoreMs: 0, firestoreReads: 0, firestoreBytes: 0 }, fn);
}

export function currentRequestMetrics() { return storage.getStore(); }

export async function measureFirestore<T>(label: string, read: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await read();
  } finally {
    const state = storage.getStore();
    if (state) {
      state.firestoreMs += performance.now() - started;
      state.firestoreReads += 1;
      // Firestore Admin snapshots do not expose wire bytes. Keep this field
      // honest: callers can supply payload bytes when they have a DTO.
      void label;
    }
  }
}

export function addFirestoreBytes(bytes: number) {
  const state = storage.getStore();
  if (state && Number.isFinite(bytes) && bytes > 0) state.firestoreBytes += bytes;
}
