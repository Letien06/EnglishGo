import { createHash } from "node:crypto";

export function splitJsonText(text, maxBytes = 700_000) {
  if (!Number.isInteger(maxBytes) || maxBytes < 4) throw new Error("Chunk size must allow a complete UTF-8 character.");
  const chunks = [];
  let start = 0;
  let index = 0;
  let bytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) {
      chunks.push(text.slice(start, index));
      start = index;
      bytes = 0;
    }
    bytes += characterBytes;
    index += character.length;
  }
  if (index > start) chunks.push(text.slice(start));
  return chunks;
}

export async function archiveJson(db, manifest, json, syncedAtMs, commitDocuments = async (documents) => {
  const batch = db.batch();
  for (const document of documents) {
    if (document.create) batch.create(db.doc(document.path), document.data);
    else batch.set(db.doc(document.path), document.data, { merge: document.merge ?? false });
  }
  await batch.commit();
}) {
  const chunks = splitJsonText(json);
  const snapshotId = `${manifest.sourceVersion}__${syncedAtMs}__${manifest.sha256.slice(0, 16)}`;
  const ref = db.collection("dauEnglishSnapshots").doc(snapshotId);
  const existing = await ref.get();
  if (existing.exists && (existing.get("sha256") !== manifest.sha256 || existing.get("bytes") !== manifest.bytes || existing.get("chunkCount") !== chunks.length)) throw new Error("Snapshot hash conflict; no existing snapshot was overwritten.");
  if (!existing.exists) {
    await commitDocuments([{ path: ref.path, create: true, data: {
      status: "writing",
      fileName: "materials.json",
      contentType: "application/json",
      source: "https://dauenglish.com",
      sourceVersion: manifest.sourceVersion,
      syncedAtMs,
      sha256: manifest.sha256,
      bytes: manifest.bytes,
      chunkCount: chunks.length,
      tests: manifest.tests,
      questions: manifest.questions,
      passages: manifest.passages,
      partCounts: manifest.partCounts,
      createdAt: new Date(),
    } }]);
  }
  if (existing.get("status") !== "complete") {
    for (let offset = 0; offset < chunks.length; offset += 8) {
      const documents = chunks.slice(offset, offset + 8).map((text, index) => ({ path: `${ref.path}/jsonChunks/${String(offset + index).padStart(4, "0")}`, data: { index: offset + index, text } }));
      const stored = await db.getAll(...documents.map((document) => db.doc(document.path)));
      await commitDocuments(documents.filter((document, index) => !stored[index].exists || stored[index].get("index") !== document.data.index || stored[index].get("text") !== document.data.text));
    }
  }
  const storedHash = createHash("sha256");
  let storedBytes = 0;
  for (let offset = 0; offset < chunks.length; offset += 8) {
    const refs = chunks.slice(offset, offset + 8).map((_, index) => ref.collection("jsonChunks").doc(String(offset + index).padStart(4, "0")));
    const docs = await db.getAll(...refs);
    for (const [index, doc] of docs.entries()) {
      const text = doc.get("text");
      if (!doc.exists || typeof text !== "string" || doc.get("index") !== offset + index) throw new Error(`Invalid archived JSON chunk: ${doc.ref.path}`);
      storedHash.update(text, "utf8");
      storedBytes += Buffer.byteLength(text, "utf8");
    }
  }
  if (storedBytes !== manifest.bytes || storedHash.digest("hex") !== manifest.sha256) throw new Error("Firestore snapshot read-back checksum failed.");
  if (existing.get("status") !== "complete") await commitDocuments([{ path: ref.path, merge: true, data: { status: "complete", verifiedAt: new Date() } }]);
  return { firestoreSnapshot: ref.path, snapshotChunks: chunks.length, snapshotVerified: true };
}
