import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { syncMedia, rewriteSnapshotMedia } from "./lib/media-storage.mjs";

const [inputFile, outputFile, ...options] = process.argv.slice(2);
if (!inputFile || !outputFile || options.length) throw new Error("Usage: sync-dauenglish-media.mjs <materials.json> <output-materials.json>");
if (path.resolve(inputFile) === path.resolve(outputFile)) throw new Error("Choose a new output file; the source snapshot is retained as the Drive backup.");

const source = JSON.parse(await readFile(inputFile, "utf8"));
const result = await syncMedia(source);
const rewritten = rewriteSnapshotMedia(source, result.bySourceUrl);
result.counts.rewritten = rewritten.rewritten;
await mkdir(path.dirname(path.resolve(outputFile)), { recursive: true });
await writeFile(outputFile, JSON.stringify(rewritten.snapshot), { encoding: "utf8", flag: "wx", mode: 0o600 });
const manifestFile = `${outputFile}.media-manifest.json`;
await writeFile(manifestFile, JSON.stringify({ formatVersion: 1, generatedAt: new Date().toISOString(), snapshotSource: path.resolve(inputFile), counts: result.counts, media: result.manifest }, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ outputFile: path.resolve(outputFile), manifestFile: path.resolve(manifestFile), ...result.counts }, null, 2));

