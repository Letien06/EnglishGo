import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDrivePackage } from "./lib/drive-package.mjs";
import { createAuthorizedDauEnglishSource } from "./lib/dauenglish-authorized-source.mjs";
import { fetchAuthorizedPracticeRows, fetchMissingPracticeMediaMetadata, createPracticeCheckpoint, readPracticeCheckpoint, practiceSourceHash } from "./lib/authorized-practice-source.mjs";
import { mapAuthorizedPracticeRows, mergeAuthorizedPracticeSnapshot } from "./lib/authorized-practice-merge.mjs";

const [baseFile, outputFile, authorization, ...extra] = process.argv.slice(2);
if (!baseFile || !outputFile || authorization !== "--authorized" || extra.length) throw new Error("Usage: sync-dauenglish-authorized-practice.mjs <existing-materials.json> <new-materials.json> --authorized");
if (path.resolve(baseFile) === path.resolve(outputFile)) throw new Error("Choose a new output file; retain the existing snapshot.");
const base = JSON.parse(await readFile(baseFile, "utf8"));
const baseSha256 = buildDrivePackage(JSON.stringify(base)).manifest.snapshotSha256;
const client = await createAuthorizedDauEnglishSource({
  baseUrl: process.env.DAUTOEIC_SUPABASE_URL,
  publicKey: process.env.DAUTOEIC_ANON_KEY,
  accessToken: process.env.DAUENGLISH_IMPORT_ACCESS_TOKEN,
});
const checkpointFile = path.join(fileURLToPath(new URL("../.seed-tmp/", import.meta.url)), "authorized-practice", `${baseSha256}-${practiceSourceHash(path.resolve(outputFile)).slice(0, 16)}.json`);
let source;
let existingCheckpoint = false;
try {
  source = readPracticeCheckpoint(JSON.parse(await readFile(checkpointFile, "utf8")), baseSha256);
  existingCheckpoint = true;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  source = await fetchAuthorizedPracticeRows(client);
}
if (source.rows.mediaTests === undefined) {
  source.rows.mediaTests = await fetchMissingPracticeMediaMetadata(client, source.rows);
  await mkdir(path.dirname(checkpointFile), { recursive: true });
  const updatedFile = existingCheckpoint ? `${checkpointFile}.${process.pid}.tmp` : checkpointFile;
  await writeFile(updatedFile, JSON.stringify(createPracticeCheckpoint(baseSha256, source)), { encoding: "utf8", flag: "wx", mode: 0o600 });
  if (existingCheckpoint) await rename(updatedFile, checkpointFile);
}
const { rows, httpDate } = source;
console.log(JSON.stringify({ checkpointFile, rowsSha256: practiceSourceHash(rows), credentialsPrinted: false }));
const mediaBase = process.env.DAUTOEIC_MEDIA_BASE_URL
  ?? "https://odlnhfaygiotcyehuysw.supabase.co/storage/v1/object/public/mock-test-media";
const archivedTests = base.materials.filter((material) => material.kind === "test").map((material) => material.payload);
const incoming = mapAuthorizedPracticeRows(rows, mediaBase, { archivedTests });
const syncedAt = new Date(httpDate).toISOString();
const snapshot = mergeAuthorizedPracticeSnapshot(base, incoming, syncedAt);
const json = JSON.stringify(snapshot);
const prepared = buildDrivePackage(json);
await mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
await writeFile(outputFile, json, { encoding: "utf8", flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ outputFile: path.resolve(outputFile), snapshotSha256: prepared.manifest.snapshotSha256,
  ...prepared.counts, authorizedPractice: incoming.report, firestoreWrites: 0, driveWrites: 0, credentialsPrinted: false,
  media: "Original authorized source audio/image URLs retained; no media copied." }, null, 2));
