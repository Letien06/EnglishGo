import { createHash } from "node:crypto";
import { adminDb } from "../firestore/db";
import { logInfo } from "../logging";

const SHARDS = 16;
const MAX_SHARD_BYTES = 650_000;
const SCHEMA = 2;
const INLINE_ROW_LIMIT = 8;
type ProgressRow = { questionId: string; itemId: string; part: number; selectedAnswer: string | null; correct: boolean };

function projectionCollection(uid: string, progressCollection: string) {
  return adminDb.collection("users").doc(uid).collection(`${progressCollection}Catalog`);
}
function shardId(part: number, questionId: string) {
  const bucket = parseInt(createHash("sha256").update(questionId).digest("hex").slice(0, 2), 16) % SHARDS;
  return `${part}-${bucket}`;
}
function compact(data: Record<string, unknown>): ProgressRow | null {
  if (typeof data.questionId !== "string" || !data.questionId || typeof data.itemId !== "string" || typeof data.part !== "number") return null;
  return { questionId: data.questionId, itemId: data.itemId, part: data.part, selectedAnswer: typeof data.selectedAnswer === "string" ? data.selectedAnswer : null, correct: data.correct === true };
}
function rowMap(value: unknown): Record<string, ProgressRow> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.create(null) as Record<string, ProgressRow>;
  return Object.assign(Object.create(null), Object.fromEntries(Object.entries(value).flatMap(([key, data]) => {
    const row = data && typeof data === "object" ? compact(data as Record<string, unknown>) : null;
    return row ? [[key, row]] : [];
  }))) as Record<string, ProgressRow>;
}

/** Full legacy migration happens once; subsequent catalog reads use compact shards. */
export async function readLearningProgressProjection(uid: string, progressCollection: string, part: number): Promise<ProgressRow[]> {
  const collection = projectionCollection(uid, progressCollection);
  const startedAt = Date.now();
  let documentReads = 0;
  let strategy: "inline" | "shards" | "migration" | "source-fallback" = "migration";
  const result = await adminDb.runTransaction(async (tx) => {
    const metadata = collection.doc(`${part}-index`);
    const meta = await tx.get(metadata);
    documentReads++;
    if (meta.data()?.ready === true && meta.data()?.schema === SCHEMA) {
      if (meta.data()?.empty === true) { strategy = "inline"; return []; }
      if (meta.data()?.inlineRows) { strategy = "inline"; return Object.values(rowMap(meta.data()?.inlineRows)); }
      const shards = await tx.get(collection.where("part", "==", part));
      documentReads += Math.max(1, shards.docs.length);
      strategy = "shards";
      return shards.docs.flatMap((doc) => Object.values(rowMap(doc.data().rows)));
    }
    const source = await tx.get(adminDb.collection("users").doc(uid).collection(progressCollection).where("part", "==", part));
    documentReads += Math.max(1, source.docs.length);
    const existing = await tx.get(collection.where("part", "==", part));
    documentReads += Math.max(1, existing.docs.length);
    const rows = source.docs.flatMap((doc) => { const row = compact(doc.data()); return row ? [row] : []; });
    const buckets = new Map<string, Record<string, ProgressRow>>();
    for (const row of rows) {
      const key = shardId(part, row.questionId);
      const bucket = buckets.get(key) ?? Object.create(null) as Record<string, ProgressRow>;
      bucket[row.questionId] = row;
      buckets.set(key, bucket);
    }
    if ([...buckets.values()].some((bucket) => Buffer.byteLength(JSON.stringify(bucket)) > MAX_SHARD_BYTES)) { strategy = "source-fallback"; return rows; }
    strategy = "migration";
    const inline = rows.length <= INLINE_ROW_LIMIT;
    if (!inline) for (const [key, rows] of buckets) tx.set(collection.doc(key), { part, rows });
    for (const shard of existing.docs) if (inline || !buckets.has(shard.id)) tx.delete(shard.ref);
    tx.set(metadata, { schema: SCHEMA, ready: true, empty: rows.length === 0, shards: inline ? [] : [...buckets.keys()], ...(inline ? { inlineRows: Object.fromEntries(rows.map((row) => [row.questionId, row])) } : {}) });
    return rows;
  });
  if (process.env.NODE_ENV === "production") logInfo("learning_progress_catalog_read", { part, progressCollection, strategy, documentReads, returnedCount: result.length, durationMs: Date.now() - startedAt });
  return result;
}

/** All reads happen now; execute the returned writer only after every transaction read. */
export async function prepareLearningProgressProjection(tx: FirebaseFirestore.Transaction, uid: string, progressCollection: string, progressData: Record<string, unknown>): Promise<() => void> {
  const row = compact(progressData);
  if (!row) return () => {};
  const collection = projectionCollection(uid, progressCollection);
  const metadata = collection.doc(`${row.part}-index`);
  const meta = await tx.get(metadata);
  if (meta.data()?.ready !== true || meta.data()?.schema !== SCHEMA) return () => {};
  if (meta.data()?.inlineRows) {
    const rows = rowMap(meta.data()?.inlineRows);
    rows[row.questionId] = row;
    if (Buffer.byteLength(JSON.stringify(rows)) > MAX_SHARD_BYTES) return () => tx.set(metadata, { schema: SCHEMA, ready: false });
    if (Object.keys(rows).length <= INLINE_ROW_LIMIT) return () => tx.set(metadata, { schema: SCHEMA, ready: true, empty: false, shards: [], inlineRows: rows });
    const buckets = new Map<string, Record<string, ProgressRow>>();
    for (const entry of Object.values(rows)) {
      const key = shardId(row.part, entry.questionId);
      const bucket = buckets.get(key) ?? Object.create(null) as Record<string, ProgressRow>;
      bucket[entry.questionId] = entry;
      buckets.set(key, bucket);
    }
    return () => {
      for (const [key, rows] of buckets) tx.set(collection.doc(key), { part: row.part, rows });
      tx.set(metadata, { schema: SCHEMA, ready: true, empty: false, shards: [...buckets.keys()] });
    };
  }
  const key = shardId(row.part, row.questionId);
  const shard = collection.doc(key);
  const snapshot = await tx.get(shard);
  const rows = rowMap(snapshot.data()?.rows);
  rows[row.questionId] = row;
  if (Buffer.byteLength(JSON.stringify(rows)) > MAX_SHARD_BYTES) return () => tx.set(metadata, { schema: SCHEMA, ready: false });
  const shards = Array.isArray(meta.data()?.shards) ? meta.data()!.shards as string[] : [];
  return () => {
    tx.set(shard, { part: row.part, rows });
    if (meta.data()?.empty === true || !shards.includes(key)) tx.set(metadata, { schema: SCHEMA, ready: true, empty: false, shards: [...new Set([...shards, key])] });
  };
}

export function learningProgressProjectionShard(uid: string, progressCollection: string, part: number, questionId: string) {
  return projectionCollection(uid, progressCollection).doc(shardId(part, questionId));
}

/** Reset uses the same shard snapshots as answer saves, so concurrent updates retry safely. */
export async function prepareLearningProgressProjectionReset(tx: FirebaseFirestore.Transaction, uid: string, progressCollection: string, part: number, questionIds: string[]): Promise<() => void> {
  const collection = projectionCollection(uid, progressCollection);
  const metadata = collection.doc(`${part}-index`);
  const meta = await tx.get(metadata);
  if (meta.data()?.ready !== true || meta.data()?.schema !== SCHEMA) return () => {};
  if (meta.data()?.inlineRows) {
    const rows = rowMap(meta.data()?.inlineRows);
    for (const id of questionIds) delete rows[id];
    return () => tx.set(metadata, { schema: SCHEMA, ready: true, empty: Object.keys(rows).length === 0, shards: [], inlineRows: rows });
  }
  const keys = [...new Set(questionIds.map((id) => shardId(part, id)))];
  const snapshots = await Promise.all(keys.map((key) => tx.get(collection.doc(key))));
  const removed = new Set(questionIds);
  const updated = snapshots.map((snapshot, index) => {
    const rows = rowMap(snapshot.data()?.rows);
    for (const id of removed) delete rows[id];
    return { key: keys[index], rows };
  });
  const shards = (Array.isArray(meta.data()?.shards) ? meta.data()!.shards as string[] : []).filter((key) => !updated.some((shard) => shard.key === key && Object.keys(shard.rows).length === 0));
  return () => {
    for (const { key, rows } of updated) {
      if (Object.keys(rows).length === 0) tx.delete(collection.doc(key));
      else tx.set(collection.doc(key), { part, rows });
    }
    tx.set(metadata, { schema: SCHEMA, ready: true, empty: shards.length === 0, shards });
  };
}
