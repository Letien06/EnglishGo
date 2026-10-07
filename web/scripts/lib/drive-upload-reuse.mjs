import { createHash } from "node:crypto";

const APP = "englishwebapp-dauenglish";
const digestPattern = /^[a-f0-9]{64}$/;
const filePattern = /^[a-zA-Z0-9_-]{10,200}$/;

/** Reuse only content-addressed chunks vouched for by a completed owner checkpoint. */
export function buildReuseCandidates(manifest, checkpoint, accountEmail, preparedDigests) {
  if (!checkpoint?.complete || checkpoint.accountEmail !== accountEmail || checkpoint.snapshotSha256 !== manifest.snapshotSha256
    || !digestPattern.test(checkpoint.snapshotSha256) || !filePattern.test(checkpoint.folderId ?? "") || !filePattern.test(checkpoint.manifestId ?? "")) {
    throw new Error("Reuse checkpoint belongs to another owner or incomplete snapshot.");
  }
  const manifestRecord = Object.values(checkpoint.files ?? {}).find((record) => record.fileId === checkpoint.manifestId);
  if (!manifestRecord?.verified) throw new Error("Reuse source manifest has not been verified.");
  const candidates = new Map();
  for (const entry of Object.values(manifest.entries)) for (const chunk of entry.chunks) {
    if (!preparedDigests.has(chunk.sha256)) continue;
    const record = checkpoint.files?.[chunk.sha256];
    if (!record?.verified || record.fileId !== chunk.fileId || !digestPattern.test(chunk.sha256) || !filePattern.test(chunk.fileId)
      || !Number.isSafeInteger(chunk.bytes) || chunk.bytes <= 0 || chunk.bytes > 700_000) throw new Error("Reuse chunk does not match the verified source checkpoint.");
    const existing = candidates.get(chunk.sha256);
    if (existing && (existing.fileId !== chunk.fileId || existing.bytes !== chunk.bytes)) throw new Error("Conflicting reuse chunk identities.");
    const source = record.reusedFrom ?? { snapshotSha256: checkpoint.snapshotSha256, folderId: checkpoint.folderId, manifestId: checkpoint.manifestId };
    if (!digestPattern.test(source.snapshotSha256 ?? "") || !filePattern.test(source.folderId ?? "") || !filePattern.test(source.manifestId ?? "")) throw new Error("Invalid reuse chunk provenance.");
    candidates.set(chunk.sha256, { fileId: chunk.fileId, bytes: chunk.bytes, sha256: chunk.sha256, source });
  }
  return candidates;
}

export function validateReuseSourceFolder(metadata, source) {
  if (!metadata || metadata.trashed || metadata.ownedByMe !== true || metadata.mimeType !== "application/vnd.google-apps.folder"
    || metadata.appProperties?.app !== APP || metadata.appProperties?.snapshot !== source.snapshotSha256) {
    throw new Error("Reuse source folder identity or ownership mismatch.");
  }
}

export function validateReuseMetadata(metadata, candidate, text) {
  const bytes = Buffer.byteLength(text);
  const sha256 = createHash("sha256").update(text).digest("hex");
  if (!metadata || metadata.id !== candidate.fileId || metadata.trashed || metadata.ownedByMe !== true || metadata.mimeType !== "text/plain"
    || metadata.appProperties?.app !== APP || metadata.appProperties?.snapshot !== candidate.source.snapshotSha256
    || metadata.appProperties?.sha256 !== sha256 || candidate.sha256 !== sha256 || candidate.bytes !== bytes
    || !metadata.parents?.includes(candidate.source.folderId) || Number(metadata.size) !== bytes
    || metadata.md5Checksum !== createHash("md5").update(text).digest("hex")) {
    throw new Error("Reusable Drive chunk changed; refusing to overwrite it.");
  }
}

export async function verifyReuseChunk(client, metadata, candidate, text) {
  validateReuseMetadata(metadata, candidate, text);
  const stored = await client.readText(candidate.fileId, candidate.bytes, 120_000);
  if (Buffer.byteLength(stored) !== candidate.bytes || createHash("sha256").update(stored).digest("hex") !== candidate.sha256) {
    throw new Error("Reusable Drive chunk read-back checksum mismatch.");
  }
}
