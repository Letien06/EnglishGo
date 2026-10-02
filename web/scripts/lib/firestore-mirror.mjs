import { splitJsonText } from "./firestore-json.mjs";

export function mirrorDocuments(material, sha256) {
  const root = `dauToeicMirror/${material.key}`;
  const syncedAtMs = Date.parse(material.syncedAt);
  if (!Number.isFinite(syncedAtMs)) throw new Error(`Invalid sync timestamp: ${material.key}`);
  const metadata = { key: material.key, kind: material.kind, source: "dautoeic", syncedAtMs, syncedAtIso: material.syncedAt, snapshotHash: sha256, updatedAt: new Date() };
  if (material.kind === "difficulty-session") {
    const { items, ...payload } = material.payload;
    const chunks = [];
    let chunk = [];
    let bytes = 2;
    for (const item of items) {
      const size = Buffer.byteLength(JSON.stringify(item), "utf8") + 1;
      if (size > 450_000) throw new Error(`Practice item is too large: ${item.id}`);
      if (chunk.length && (chunk.length >= 50 || bytes + size > 450_000)) {
        chunks.push(chunk);
        chunk = [];
        bytes = 2;
      }
      chunk.push(item);
      bytes += size;
    }
    if (chunk.length) chunks.push(chunk);
    return [
      ...chunks.map((items, index) => ({ path: `${root}/chunks/${String(index).padStart(4, "0")}`, data: { index, items } })),
      { path: root, data: { ...metadata, payload, itemCount: items.length, chunkCount: chunks.length } },
    ];
  }
  const json = JSON.stringify(material.payload);
  if (Buffer.byteLength(json, "utf8") <= 450_000) return [{ path: root, data: { ...metadata, chunked: false, chunkCount: 0, payload: material.payload } }];
  const chunks = splitJsonText(json, 450_000);
  return [
    ...chunks.map((text, index) => ({ path: `${root}/jsonChunks/${String(index).padStart(4, "0")}`, data: { index, text } })),
    { path: root, data: { ...metadata, chunked: true, chunkCount: chunks.length } },
  ];
}
