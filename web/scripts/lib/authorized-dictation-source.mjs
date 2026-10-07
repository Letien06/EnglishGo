import { createHash } from "node:crypto";
import { dictationCatalogSchema, dictationSetSchema } from "../../src/lib/storage/dictation-snapshot.ts";

export const dictationSourceHash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function createDictationCheckpoint(baseSha256, source) {
  return { format: "authorized-dictation-source-v1", source: "https://dauenglish.com", baseSha256, ...source, rowsSha256: dictationSourceHash(source.rows) };
}
export function readDictationCheckpoint(value, baseSha256) {
  if (value?.format !== "authorized-dictation-source-v1" || value.source !== "https://dauenglish.com" || value.baseSha256 !== baseSha256 || value.rowsSha256 !== dictationSourceHash(value.rows) || !Number.isFinite(Date.parse(value.httpDate)) || !["sets", "items", "collections", "chapters", "stats"].every(key => Array.isArray(value.rows?.[key]))) throw new Error("Invalid authorized dictation checkpoint.");
  return { rows: value.rows, httpDate: value.httpDate };
}
export async function fetchAuthorizedDictationRows(client) {
  let httpDate;
  async function table(name, params = {}, order = "id.asc") {
    const rows = [];
    let expected;
    for (let page = 0; page < 100; page++) {
      const result = await client.request(`/rest/v1/${name}`, { params: { select: "*", order, limit: 1000, offset: rows.length, ...params }, headers: { Prefer: "count=exact" } });
      const count = result.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
      const total = Number(count);
      if (!Array.isArray(result.data) || count === undefined || !Number.isSafeInteger(total) || total < 0 || total > 100000 || (expected !== undefined && total !== expected) || result.data.length > 1000) throw new Error(`Invalid authorized ${name} count or rows.`);
      expected = total;
      rows.push(...result.data);
      if (result.httpDate) httpDate = result.httpDate;
      if (rows.length === total) return rows;
      if (!result.data.length || rows.length > total) throw new Error(`Incomplete authorized ${name} pagination.`);
    }
    throw new Error("Authorized dictation pagination limit exceeded.");
  }
  const sets = await table("listening_sets", { is_hidden: "eq.false" });
  const collections = await table("listening_collection_order", {}, "collection_name.asc");
  const chapters = await table("listening_chapter_order", {}, "collection_name.asc,chapter_name.asc");
  const statsResult = await client.request("/rest/v1/rpc/get_listening_set_stats", { method: "POST", body: {} });
  if (!Array.isArray(statsResult.data)) throw new Error("Invalid authorized dictation statistics.");
  const items = [];
  for (const set of sets) {
    if (typeof set.id !== "string" || !set.id) throw new Error("Invalid authorized dictation set ID.");
    items.push(...await table("listening_items", { set_id: `eq.${set.id}`, is_hidden: "eq.false" }));
  }
  if (!httpDate || !Number.isFinite(Date.parse(httpDate))) throw new Error("Missing authorized dictation source date.");
  return { rows: { sets, items, collections, chapters, stats: statsResult.data }, httpDate };
}
export function dictationRowsReport(rows) {
  return { sets: rows.sets.length, freeSets: rows.sets.filter(row => row.access_level === "free").length, proSets: rows.sets.filter(row => row.access_level === "pro").length, items: rows.items.length, unavailableTranscripts: rows.items.filter(row => typeof row.transcript !== "string" || !row.transcript.trim()).length, collections: rows.collections.length, chapters: rows.chapters.length, statistics: rows.stats.length, itemFields: [...new Set(rows.items.flatMap(row => Object.keys(row)))].sort() };
}
const nullable = value => value == null ? null : String(value);
const numberOrNull = value => value == null ? null : Number(value);
export function mapAuthorizedDictationRows({ rows, httpDate }) {
  const meta = { version: 1, source: "https://dauenglish.com", accessScope: "provider-authorized" };
  const ids = new Set(rows.sets.map(row => row.id));
  if (ids.size !== rows.sets.length || new Set(rows.items.map(row => row.id)).size !== rows.items.length || rows.items.some(row => !ids.has(row.set_id))) throw new Error("Duplicate or orphan authorized dictation records.");
  const sets = rows.sets.map(row => {
    const items = rows.items.filter(item => item.set_id === row.id);
    const stat = rows.stats.find(item => item.set_id === row.id);
    if (!stat || Number(stat.item_count) !== items.length || !items.length) throw new Error(`Incomplete authorized dictation set: ${row.id}`);
    return { id: row.id, name: row.name, part: row.toeic_part == null ? null : Number(String(row.toeic_part).replace(/\D/g, "")), accessLevel: row.access_level, orderIndex: numberOrNull(row.order_index), collectionName: nullable(row.collection_name), chapterName: nullable(row.chapter_name), subtitle: nullable(row.subtitle), itemCount: items.length };
  });
  const collections = rows.collections.map(row => ({ name: row.collection_name, orderIndex: numberOrNull(row.order_index) }));
  const chapters = rows.chapters.map(row => ({ collectionName: row.collection_name, name: row.chapter_name, orderIndex: numberOrNull(row.order_index) }));
  // Ordering tables are optional source presentation metadata. Preserve labels
  // present on actual sets even when the provider has omitted their sort entry.
  for (const set of sets) {
    if (set.collectionName && !collections.some(row => row.name === set.collectionName)) collections.push({ name: set.collectionName, orderIndex: null });
    if (set.collectionName && set.chapterName && !chapters.some(row => row.collectionName === set.collectionName && row.name === set.chapterName)) chapters.push({ collectionName: set.collectionName, name: set.chapterName, orderIndex: null });
  }
  const catalog = dictationCatalogSchema.parse({ ...meta, syncedAt: new Date(httpDate).toISOString(), collections, chapters, sets });
  const sessions = sets.map(set => dictationSetSchema.parse({ ...meta, setId: set.id, items: rows.items.filter(row => row.set_id === set.id).map(row => ({ id: row.id, setId: row.set_id, orderIndex: numberOrNull(row.order_index), audioUrl: row.audio_url, transcript: row.transcript, ...(typeof row.transcript === "string" && !row.transcript.trim() ? { transcriptMissing: true } : {}), translationVi: nullable(row.translation_vi), hint: nullable(row.hint), vocabulary: nullable(row.vocabulary), durationSeconds: numberOrNull(row.duration_seconds), groupId: nullable(row.group_id) })).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || a.id.localeCompare(b.id)) }));
  return { catalog, sessions };
}
export function mergeAuthorizedDictationSnapshot(base, incoming) {
  const prefix = "dauenglish-v2__dictation__";
  if (base.materials.some(material => material.key.startsWith(prefix))) throw new Error("Dictation material already exists; retain the archived corpus.");
  return { ...base, syncedAt: incoming.catalog.syncedAt, materials: [...base.materials, { key: `${prefix}catalog`, kind: "dictation-catalog", payload: incoming.catalog }, ...incoming.sessions.map(payload => ({ key: `${prefix}set__${payload.setId}`, kind: "dictation-set", payload }))] };
}
