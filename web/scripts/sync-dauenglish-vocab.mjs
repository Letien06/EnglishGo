import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { buildDrivePackage } from "./lib/drive-package.mjs";
import { mergeVocabularySnapshots, parsePublicVocabularyCatalog, replaceVocabularyMaterial, vocabularySyncTimestamp } from "./lib/vocabulary-merge.mjs";

const [baseFile, outputFile] = process.argv.slice(2);
if (!baseFile || !outputFile) throw new Error("Usage: sync-dauenglish-vocab.mjs <existing-materials.json> <output-materials.json>");
if (path.resolve(baseFile) === path.resolve(outputFile)) throw new Error("Keep the existing snapshot unchanged; choose a new output file.");
if (process.env.DAUTOEIC_SUPABASE_URL !== "https://odlnhfaygiotcyehuysw.supabase.co") throw new Error("The current Dau English source is required.");
const publicKey = process.env.DAUTOEIC_ANON_KEY;
if (!publicKey?.startsWith("sb_publishable_")) throw new Error("The current public Dau English connection is required; private credentials are not supported.");
const snapshot = JSON.parse(await readFile(baseFile, "utf8"));
buildDrivePackage(JSON.stringify(snapshot));
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, fsCache: false });
const { fetchVocabularySnapshotFromSource } = await jiti.import("../src/lib/services/dautoeic-vocab.ts");
const catalogResponse = await fetch(`${process.env.DAUTOEIC_SUPABASE_URL}/rest/v1/rpc/get_vocabulary_catalog`, {
  method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json", Accept: "application/json" },
  body: "{}", signal: AbortSignal.timeout(15000),
});
if (!catalogResponse.ok) throw new Error(`Public vocabulary catalogue returned ${catalogResponse.status}.`);
const currentCatalog = parsePublicVocabularyCatalog(await catalogResponse.json());
const incoming = await fetchVocabularySnapshotFromSource();
const existing = snapshot.materials.find(material => material.key === "dauenglish-v2__vocabulary__all")?.payload;
const { vocabulary, report } = mergeVocabularySnapshots(existing, incoming, currentCatalog);
snapshot.syncedAt = vocabularySyncTimestamp(catalogResponse.headers.get("date"));
snapshot.materials = replaceVocabularyMaterial(snapshot.materials, vocabulary, snapshot.syncedAt);
const json = JSON.stringify(snapshot);
const prepared = buildDrivePackage(json);
await mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
await writeFile(outputFile, json, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ outputFile: path.resolve(outputFile), snapshotSha256: prepared.manifest.snapshotSha256, vocabularyTests: vocabulary.catalog.tests.length, vocabularyParts: vocabulary.parts.length, vocabularyWords: vocabulary.words.length, firestoreWrites: 0, ...prepared.counts, vocabularyMerge: report }, null, 2));
