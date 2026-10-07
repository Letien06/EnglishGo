import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAuthorizedDauEnglishSource } from "./lib/dauenglish-authorized-source.mjs";
import { buildDrivePackage } from "./lib/drive-package.mjs";
import { createDictationCheckpoint, readDictationCheckpoint, fetchAuthorizedDictationRows, dictationRowsReport, mapAuthorizedDictationRows, mergeAuthorizedDictationSnapshot } from "./lib/authorized-dictation-source.mjs";

const [baseFile, outputFile, authorization, mode, ...extra] = process.argv.slice(2);
if (!baseFile || !outputFile || authorization !== "--authorized" || (mode && mode !== "--metadata-only") || extra.length) throw new Error("Usage: sync-dauenglish-authorized-dictation.mjs <base.json> <new.json> --authorized [--metadata-only]");
if (path.resolve(baseFile) === path.resolve(outputFile)) throw new Error("Use a new output path.");
const base = JSON.parse(await readFile(baseFile, "utf8"));
const baseSha256 = buildDrivePackage(JSON.stringify(base)).manifest.snapshotSha256;
const checkpointFile = `${path.resolve(outputFile)}.dictation-source.json`;
let source;
try { source = readDictationCheckpoint(JSON.parse(await readFile(checkpointFile, "utf8")), baseSha256); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  const client = await createAuthorizedDauEnglishSource({ baseUrl: process.env.DAUTOEIC_SUPABASE_URL, publicKey: process.env.DAUTOEIC_ANON_KEY, accessToken: process.env.DAUENGLISH_IMPORT_ACCESS_TOKEN });
  source = await fetchAuthorizedDictationRows(client);
  await mkdir(path.dirname(checkpointFile), { recursive: true });
  await writeFile(checkpointFile, JSON.stringify(createDictationCheckpoint(baseSha256, source)), { flag: "wx", mode: 0o600 });
}
console.log(JSON.stringify({ checkpointFile, ...dictationRowsReport(source.rows), credentialsPrinted: false }));
if (mode !== "--metadata-only") {
  const incoming = mapAuthorizedDictationRows(source);
  const snapshot = mergeAuthorizedDictationSnapshot(base, incoming);
  const json = JSON.stringify(snapshot);
  const prepared = buildDrivePackage(json);
  await writeFile(outputFile, json, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ outputFile: path.resolve(outputFile), ...prepared.counts, dictationSets: incoming.catalog.sets.length, firestoreWrites: 0, credentialsPrinted: false }));
}
