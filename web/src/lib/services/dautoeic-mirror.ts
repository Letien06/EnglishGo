import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import type { DauToeicDifficultySession } from "@/types/dautoeic";

const MIRROR_COLLECTION = "dauToeicMirror";
const SYNC_COLLECTION = "dauToeicSyncStatus";
const SESSION_CHUNK_SIZE = 50;
const JSON_CHUNK_CHAR_SIZE = 450_000;
const DIRECT_JSON_CHAR_LIMIT = 650_000;

export interface MirrorMeta {
  key: string;
  kind: string;
  syncedAtMs: number;
  syncedAtIso: string;
  source: "dautoeic";
}

export interface SyncStatus {
  id: string;
  status: "idle" | "running" | "success" | "partial" | "failed";
  cursor: number;
  totalTasks: number;
  lastStartedAtMs: number | null;
  lastFinishedAtMs: number | null;
  updatedAtMs: number | null;
  cycleId: string | null;
  errors: Array<{ taskId: string; message: string; at: string }>;
}

export function mirrorKey(...parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "all").trim().replace(/[^a-zA-Z0-9_-]+/g, "_"))
    .join("__");
}

export async function readMirrorJson<T>(key: string): Promise<T | null> {
  const ref = adminDb.collection(MIRROR_COLLECTION).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as { payload?: T; chunked?: boolean; chunkCount?: number } | undefined;
  if (data?.chunked) {
    const chunkCount = Math.max(0, Number(data.chunkCount) || 0);
    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) =>
        ref.collection("jsonChunks").doc(chunkId(index)).get(),
      ),
    );
    const text = chunks
      .map((chunk) => (chunk.data() as { text?: string } | undefined)?.text ?? "")
      .join("");
    return text ? (JSON.parse(text) as T) : null;
  }
  return data?.payload ?? null;
}

export async function writeMirrorJson<T>(
  key: string,
  kind: string,
  payload: T,
): Promise<void> {
  const now = Date.now();
  const ref = adminDb.collection(MIRROR_COLLECTION).doc(key);
  const json = JSON.stringify(payload);
  if (json.length <= DIRECT_JSON_CHAR_LIMIT) {
    await ref.set(
      {
        key,
        kind,
        source: "dautoeic",
        chunked: false,
        payload,
        chunkCount: 0,
        syncedAtMs: now,
        syncedAtIso: new Date(now).toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  const chunks = chunkString(json, JSON_CHUNK_CHAR_SIZE);
  const batch = adminDb.batch();
  batch.set(
    ref,
    {
      key,
      kind,
      source: "dautoeic",
      chunked: true,
      payload: FieldValue.delete(),
      chunkCount: chunks.length,
      syncedAtMs: now,
      syncedAtIso: new Date(now).toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  chunks.forEach((text, index) => {
    batch.set(ref.collection("jsonChunks").doc(chunkId(index)), {
      index,
      text,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function readMirrorSession(
  key: string,
): Promise<DauToeicDifficultySession | null> {
  const ref = adminDb.collection(MIRROR_COLLECTION).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as
    | {
        payload?: Omit<DauToeicDifficultySession, "items">;
        itemCount?: number;
        chunkCount?: number;
      }
    | undefined;
  if (!data?.payload) return null;
  const chunkCount = Math.max(0, Number(data.chunkCount) || 0);
  const chunks = await Promise.all(
    Array.from({ length: chunkCount }, (_, index) =>
      ref.collection("chunks").doc(chunkId(index)).get(),
    ),
  );
  const items = chunks.flatMap((chunk) => {
    const chunkData = chunk.data() as
      | { items?: DauToeicDifficultySession["items"] }
      | undefined;
    return chunkData?.items ?? [];
  });
  return { ...data.payload, items };
}

export async function writeMirrorSession(
  key: string,
  session: DauToeicDifficultySession,
): Promise<void> {
  const now = Date.now();
  const ref = adminDb.collection(MIRROR_COLLECTION).doc(key);
  const chunks = chunkArray(session.items, SESSION_CHUNK_SIZE);
  const batch = adminDb.batch();
  const { items, ...payload } = session;
  batch.set(
    ref,
    {
      key,
      kind: "difficulty-session",
      source: "dautoeic",
      payload,
      itemCount: items.length,
      chunkSize: SESSION_CHUNK_SIZE,
      chunkCount: chunks.length,
      syncedAtMs: now,
      syncedAtIso: new Date(now).toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  chunks.forEach((chunk, index) => {
    batch.set(ref.collection("chunks").doc(chunkId(index)), {
      index,
      items: chunk,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function readSyncStatus(id = "weeklyMirror"): Promise<SyncStatus | null> {
  const snap = await adminDb.collection(SYNC_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<SyncStatus> | undefined;
  return {
    id,
    status: data?.status ?? "idle",
    cursor: Number(data?.cursor) || 0,
    totalTasks: Number(data?.totalTasks) || 0,
    lastStartedAtMs: typeof data?.lastStartedAtMs === "number" ? data.lastStartedAtMs : null,
    lastFinishedAtMs: typeof data?.lastFinishedAtMs === "number" ? data.lastFinishedAtMs : null,
    updatedAtMs: typeof data?.updatedAtMs === "number" ? data.updatedAtMs : null,
    cycleId: data?.cycleId ?? null,
    errors: Array.isArray(data?.errors) ? data.errors : [],
  };
}

export async function writeSyncStatus(
  status: Partial<SyncStatus>,
  id = "weeklyMirror",
): Promise<void> {
  const now = Date.now();
  await adminDb.collection(SYNC_COLLECTION).doc(id).set(
    {
      ...status,
      updatedAtMs: now,
      updatedAtIso: new Date(now).toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function chunkString(value: string, size: number): string[] {
  const result: string[] = [];
  for (let index = 0; index < value.length; index += size) {
    result.push(value.slice(index, index + size));
  }
  return result;
}

function chunkId(index: number) {
  return String(index).padStart(4, "0");
}
