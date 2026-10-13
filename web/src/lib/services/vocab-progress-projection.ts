import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "../firestore/db";

const PROJECTION = "vocabProgressCatalog";
const INDEX = "index";
const SHARDS = 16;
const MAX_SHARD_BYTES = 650_000;
const SCHEMA = 1;

export type VocabProgressProjectionRow = {
  wordId: number;
  setId: number;
  status: string;
  nextReviewAtMillis?: number;
  lastReviewedAtMillis?: number;
};


function collection(uid: string) {
  return adminDb.collection("users").doc(uid).collection(PROJECTION);
}

function shardId(wordId: number): string {
  const bucket = parseInt(createHash("sha256").update(String(wordId)).digest("hex").slice(0, 2), 16) % SHARDS;
  return String(bucket);
}

function isRow(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toRow(data: Record<string, unknown>): VocabProgressProjectionRow | null {
  const wordId = Number(data.wordId);
  const setId = Number(data.setId);
  if (!Number.isFinite(wordId) || !Number.isFinite(setId) || typeof data.status !== "string") return null;
  const row: VocabProgressProjectionRow = { wordId, setId, status: data.status };
  if (typeof data.nextReviewAtMillis === "number") row.nextReviewAtMillis = data.nextReviewAtMillis;
  if (typeof data.lastReviewedAtMillis === "number") row.lastReviewedAtMillis = data.lastReviewedAtMillis;
  return row;
}

function rowsFromShard(value: unknown): Record<string, VocabProgressProjectionRow> | null {
  if (!isRow(value)) return null;
  const rows: Record<string, VocabProgressProjectionRow> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isRow(item)) return null;
    const row = toRow(item);
    if (!row || String(row.wordId) !== key) return null;
    rows[key] = row;
  }
  return rows;
}

function fits(rows: Record<string, VocabProgressProjectionRow>): boolean {
  return Buffer.byteLength(JSON.stringify(rows)) <= MAX_SHARD_BYTES;
}

function splitRows(rows: VocabProgressProjectionRow[]): Map<string, Record<string, VocabProgressProjectionRow>> {
  const result = new Map<string, Record<string, VocabProgressProjectionRow>>();
  for (const row of rows) {
    const key = shardId(row.wordId);
    const bucket = result.get(key) ?? {};
    bucket[String(row.wordId)] = row;
    result.set(key, bucket);
  }
  return result;
}

function projectionRows(snapshot: FirebaseFirestore.QuerySnapshot): VocabProgressProjectionRow[] | null {
  const index = snapshot.docs.find((doc) => doc.id === INDEX)?.data();
  if (index?.ready !== true || index.schema !== SCHEMA || !Array.isArray(index.shards)) return null;
  const shards = index.shards as unknown[];
  const shardIds = shards.filter((item): item is string => typeof item === "string" && /^([0-9]|1[0-5])$/.test(item));
  if (shardIds.length !== shards.length || new Set(shardIds).size !== shardIds.length) return null;
  const docs = new Map(snapshot.docs.filter((doc) => doc.id !== INDEX).map((doc) => [doc.id, doc]));
  if (docs.size !== shardIds.length || shardIds.some((id) => !docs.has(id))) return null;
  const rows: VocabProgressProjectionRow[] = [];
  for (const id of shardIds) {
    const data = docs.get(id)?.data();
    const bucket = rowsFromShard(data?.rows);
    if (!bucket || Object.keys(bucket).some((wordId) => shardId(Number(wordId)) !== id || !fits(bucket))) return null;
    rows.push(...Object.values(bucket));
  }
  return rows;
}

function queryFor(uid: string, ids: string[]) {
  return collection(uid).where(FieldPath.documentId(), "in", ids);
}

/** Reads only the projection metadata and populated shards. */
export async function readVocabProgressProjection(uid: string): Promise<VocabProgressProjectionRow[] | null> {
  const snapshot = await queryFor(uid, [INDEX, ...Array.from({ length: SHARDS }, (_, index) => String(index))]).get();
  return projectionRows(snapshot);
}

/** Builds the projection once for a legacy user, inside a transaction. */
export async function bootstrapVocabProgressProjection(
  uid: string,
  source: FirebaseFirestore.CollectionReference,
): Promise<VocabProgressProjectionRow[] | null> {
  const existing = await readVocabProgressProjection(uid);
  if (existing) return existing;
  return adminDb.runTransaction(async (tx) => {
    const projectionRef = collection(uid);
    const indexRef = projectionRef.doc(INDEX);
    const existingSnap = await tx.get(queryFor(uid, [INDEX, ...Array.from({ length: SHARDS }, (_, index) => String(index))]));
    const existingRows = projectionRows(existingSnap);
    if (existingRows) return existingRows;
    const sourceSnap = await tx.get(source.select("wordId", "setId", "status", "nextReviewAtMillis", "lastReviewedAtMillis"));
    const rows = sourceSnap.docs.map((doc) => toRow({ ...(doc.data() ?? {}), wordId: doc.data()?.wordId ?? Number(doc.id) })).filter((row): row is VocabProgressProjectionRow => row !== null);
    const buckets = splitRows(rows);
    if ([...buckets.values()].some((bucket) => !fits(bucket))) {
      tx.set(indexRef, { schema: SCHEMA, ready: false }, { merge: true });
      return null;
    }
    const active = new Set(buckets.keys());
    for (const doc of existingSnap.docs) if (doc.id !== INDEX && !active.has(doc.id)) tx.delete(doc.ref);
    for (const [id, bucket] of buckets) tx.set(projectionRef.doc(id), { rows: bucket });
    tx.set(indexRef, { schema: SCHEMA, ready: true, shards: [...buckets.keys()] }, { merge: true });
    return rows;
  });
}

/**
 * Reads every projection document needed for a batch before any write is
 * queued. The returned callback only schedules writes, preserving Firestore's
 * read-before-write transaction rule.
 */
export async function prepareVocabProgressProjection(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  progressRows: Record<string, unknown>[],
): Promise<() => void> {
  const rows = progressRows.map(toRow).filter((row): row is VocabProgressProjectionRow => row !== null);
  if (!rows.length) return () => {};
  const projectionRef = collection(uid);
  const indexRef = projectionRef.doc(INDEX);
  const indexSnap = await tx.get(indexRef);
  const index = indexSnap.data();
  if (index?.ready !== true || index.schema !== SCHEMA || !Array.isArray(index.shards)) return () => {};
  const keys = [...new Set(rows.map((row) => shardId(row.wordId)))];
  const shardSnaps = await Promise.all(keys.map((key) => tx.get(projectionRef.doc(key))));
  const listed = new Set(index.shards as string[]);
  const buckets = new Map<string, Record<string, VocabProgressProjectionRow>>();
  for (let index = 0; index < keys.length; index++) {
    const parsed = !shardSnaps[index].exists && !listed.has(keys[index])
      ? {}
      : rowsFromShard(shardSnaps[index].data()?.rows);
    if (parsed === null) return () => tx.set(indexRef, { schema: SCHEMA, ready: false }, { merge: true });
    buckets.set(keys[index], parsed);
  }
  for (const row of rows) {
    const bucket = buckets.get(shardId(row.wordId))!;
    bucket[String(row.wordId)] = row;
  }
  if ([...buckets.values()].some((bucket) => !fits(bucket))) return () => tx.set(indexRef, { schema: SCHEMA, ready: false }, { merge: true });
  const shardIds = [...new Set([...(index.shards as string[]), ...keys])];
  return () => {
    for (const [key, bucket] of buckets) tx.set(projectionRef.doc(key), { rows: bucket }, { merge: true });
    tx.set(indexRef, { schema: SCHEMA, ready: true, shards: shardIds }, { merge: true });
  };
}
