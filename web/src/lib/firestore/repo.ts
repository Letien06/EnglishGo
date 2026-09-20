/**
 * Generic Firestore CRUD helpers using Firebase Admin SDK.
 *
 * Ported from `service/firestore/FirestoreSupport.java`.
 * Pagination uses cursor-based approach (startAfter) — no SQL-style offset.
 */
import { adminDb } from "./db";
import type { Paged } from "../../types/pagination";

/**
 * Fetch a single document by ID from a top-level collection.
 * Returns `null` when the document does not exist.
 */
export async function getById<T extends Record<string, unknown>>(
  col: string,
  id: string,
): Promise<(T & { id: string }) | null> {
  const snap = await adminDb.collection(col).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as T) };
}

/**
 * List documents with cursor-based pagination.
 *
 * @param col       - Firestore collection name
 * @param opts.size - page size (max documents to return)
 * @param opts.cursor - (optional) document ID to start after
 * @param opts.orderBy - field to order by (defaults to `__name__`)
 */
export async function list<T extends Record<string, unknown>>(
  col: string,
  opts: { size: number; cursor?: string; orderBy?: string },
): Promise<Paged<T & { id: string }>> {
  const orderField = opts.orderBy ?? "__name__";
  let query = adminDb.collection(col).orderBy(orderField).limit(opts.size);

  if (opts.cursor) {
    const cursorSnap = await adminDb.collection(col).doc(opts.cursor).get();
    if (cursorSnap.exists) {
      query = query.startAfter(cursorSnap);
    }
  }

  const [snapshot, totalSnapshot] = await Promise.all([
    query.get(),
    adminDb.collection(col).count().get(),
  ]);
  const items: (T & { id: string })[] = [];
  let nextCursor: string | undefined;

  snapshot.forEach((doc) => {
    items.push({ id: doc.id, ...(doc.data() as T) });
    nextCursor = doc.id;
  });

  return {
    items,
    total: totalSnapshot.data().count,
    page: 1,
    size: opts.size,
    nextCursor: items.length === opts.size ? nextCursor : undefined,
  };
}

/**
 * Create a new document with an auto-generated ID.
 * Returns the generated document ID.
 */
export async function create(
  col: string,
  data: Record<string, unknown>,
): Promise<string> {
  const ref = adminDb.collection(col).doc();
  await ref.set(data);
  return ref.id;
}

/**
 * Create a document with a specific ID (e.g. Firebase UID for users).
 */
export async function createWithId(
  col: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await adminDb.collection(col).doc(id).set(data);
}

/**
 * Partially update an existing document.
 */
export async function update(
  col: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await adminDb.collection(col).doc(id).update(data);
}

/**
 * Delete a document by ID.
 */
export async function remove(col: string, id: string): Promise<void> {
  await adminDb.collection(col).doc(id).delete();
}
