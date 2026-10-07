import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthorizedDauEnglishSource } from "./lib/dauenglish-authorized-source.mjs";
import { fetchAuthorizedGrammarRows, grammarCheckpoint, readGrammarCheckpoint } from "./lib/authorized-grammar-source.mjs";
import { practiceSourceHash } from "./lib/authorized-practice-source.mjs";

const [baseFile, outputFile, authorization, mode, ...extra] = process.argv.slice(2);
if (!baseFile || !outputFile || authorization !== "--authorized" || (mode && mode !== "--metadata-only") || extra.length) throw new Error("Usage: sync-dauenglish-authorized-grammar.mjs <base.json> <output.json> --authorized [--metadata-only]");
if (path.resolve(baseFile) === path.resolve(outputFile)) throw new Error("Grammar import requires a new output path.");
const client = await createAuthorizedDauEnglishSource({ baseUrl: process.env.DAUTOEIC_SUPABASE_URL, publicKey: process.env.DAUTOEIC_ANON_KEY, accessToken: process.env.DAUENGLISH_IMPORT_ACCESS_TOKEN });
const checkpointFile = path.join(fileURLToPath(new URL("../.seed-tmp/", import.meta.url)), "authorized-grammar", `${practiceSourceHash(path.resolve(outputFile)).slice(0, 16)}.json`);
let source;
try { source = readGrammarCheckpoint(JSON.parse(await readFile(checkpointFile, "utf8"))); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  source = await fetchAuthorizedGrammarRows(client);
  await mkdir(path.dirname(checkpointFile), { recursive: true });
  await writeFile(checkpointFile, JSON.stringify(grammarCheckpoint(source)), { flag: "wx", mode: 0o600 });
}
console.log(JSON.stringify({ checkpointFile, rowsSha256: practiceSourceHash(source.rows), counts: Object.fromEntries(["topics", "subtopics", "questions"].map((name) => [name, source.rows[name].length])), fields: Object.fromEntries(["topics", "subtopics", "questions"].map((name) => [name, Object.keys(source.rows[name][0] ?? {})])), credentialsPrinted: false, firestoreWrites: 0, driveWrites: 0 }));
if (!mode) {
  const { mergeAuthorizedGrammarSnapshot } = await import("./lib/authorized-grammar-merge.mjs");
  const { buildDrivePackage } = await import("./lib/drive-package.mjs");
  const base = JSON.parse(await readFile(baseFile, "utf8"));
  const snapshot = mergeAuthorizedGrammarSnapshot(base, source.rows, new Date(source.httpDate).toISOString());
  const json = JSON.stringify(snapshot), prepared = buildDrivePackage(json);
  await mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
  await writeFile(outputFile, json, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ outputFile: path.resolve(outputFile), snapshotSha256: prepared.manifest.snapshotSha256, counts: prepared.counts }));
}
