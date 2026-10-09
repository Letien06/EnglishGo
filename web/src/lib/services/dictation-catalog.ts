import { createHash } from "node:crypto";
import { FieldValue, type WriteBatch } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import type { DictationLessonCard } from "./dictation";
import { measureFirestore, addFirestoreBytes } from "@/lib/telemetry/server";

const SHARDS = 16;
const root = () => adminDb.collection("publicCatalogs").doc("dictation-v1");
const shardRef = (index: number) => root().collection("shards").doc(String(index));
const bucket = (id: string) => createHash("sha256").update(id).digest()[0] % SHARDS;
let cached: { until: number; cards: DictationLessonCard[] } | undefined;
let pending: Promise<DictationLessonCard[]> | undefined;

/** Publish/archive and the public projection share the same atomic batch. */
export function updateDictationCatalog(batch: WriteBatch, id: string, card: DictationLessonCard | null) {
  batch.set(shardRef(bucket(id)), { cards: { [id]: card ?? FieldValue.delete() } }, { merge: true });
  batch.set(root(), { revision: FieldValue.increment(1) }, { merge: true });
  cached = undefined;
}

export function invalidateDictationCatalog() { cached = undefined; }

export async function readDictationCatalog(loadLegacy: () => Promise<DictationLessonCard[]>): Promise<DictationLessonCard[]> {
  if (cached && cached.until > Date.now()) return cached.cards;
  if (pending) return pending;
  pending = (async () => {
    // Bootstrap old deployments once. A revision fence prevents a concurrent
    // publish/archive from being overwritten by the migration snapshot.
    for (let attempt = 0; attempt < 3; attempt++) {
      const meta = await measureFirestore("dictation-catalog-meta", () => root().get());
      if (meta.get("ready") === true) {
        const snapshots = await measureFirestore("dictation-catalog-shards", () => adminDb.getAll(...Array.from({ length: SHARDS }, (_, i) => shardRef(i))));
        const cards = snapshots.flatMap(doc => Object.values(doc.get("cards") ?? {})) as DictationLessonCard[];
        addFirestoreBytes(Buffer.byteLength(JSON.stringify(cards)));
        cached = { until: Date.now() + 30_000, cards };
        return cards;
      }
      const cards = await loadLegacy();
      const shards: Record<string, DictationLessonCard>[] = Array.from({ length: SHARDS }, () => ({}));
      cards.forEach(card => { shards[bucket(card.id)][card.id] = card; });
      if (shards.some(shard => Buffer.byteLength(JSON.stringify(shard)) > 750_000)) throw new Error("Dictation catalog requires more shards");
      const installed = await adminDb.runTransaction(async tx => {
        const current = await tx.get(root());
        if (current.get("ready") === true || (current.get("revision") ?? 0) !== (meta.get("revision") ?? 0)) return false;
        shards.forEach((cards, i) => tx.set(shardRef(i), { cards }));
        tx.set(root(), { ready: true }, { merge: true });
        return true;
      });
      if (installed) { cached = { until: Date.now() + 30_000, cards }; return cards; }
    }
    throw new Error("Dictation catalog changed during initialization; retry");
  })().finally(() => { pending = undefined; });
  return pending;
}
