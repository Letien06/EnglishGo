import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { writeGrammarIndexes } from "./lib/build-grammar-indexes.mjs";

// Offline verification uses the already downloaded, checksummed content bundle.
// It never downloads source content or accepts an unverified material payload.
const id = process.argv[2];
assert(/^[a-zA-Z0-9_-]{10,200}$/.test(id ?? ""), "Pass a local manifest folder ID.");
const folder = path.resolve(".content/dauenglish", id);
const jiti = createJiti(import.meta.url, { fsCache: false });
const { driveManifestSchema } = await jiti.import("../src/lib/storage/drive-manifest.ts");
const { decodeBundledMaterial } = await jiti.import("../src/lib/storage/bundled-material.ts");
const { buildTestPartCatalogEntry, testPartCatalogIndexSchema } = await jiti.import("../src/lib/storage/test-part-catalog-index.ts");
const manifest = driveManifestSchema.parse(JSON.parse(await readFile(path.join(folder, "manifest.json"), "utf8")));
const parts = Array.from({ length: 7 }, () => ({}));
let sourceBytes = 0;
for (const entry of Object.values(manifest.entries)) {
  if (entry.kind !== "test-part") continue;
  const raw = await decodeBundledMaterial(await readFile(path.join(folder, `${entry.sha256}.json.gz`)), entry);
  sourceBytes += Buffer.byteLength(raw);
  const content = JSON.parse(raw);
  parts[content.part - 1][content.test.id] = buildTestPartCatalogEntry(content);
}
let indexBytes = 0;
for (let part = 1; part <= 7; part++) {
  const index = testPartCatalogIndexSchema.parse({ sourceVersion: manifest.sourceVersion, snapshotSha256: manifest.snapshotSha256, part, entries: parts[part - 1] });
  const text = JSON.stringify(index);
  indexBytes += Buffer.byteLength(text);
  await writeFile(path.join(folder, `catalog-part-${part}.json`), text);
}
console.log(JSON.stringify({ sourceBytes, indexBytes, reductionPercent: Math.round(100 * (1 - indexBytes / sourceBytes)) }));
console.log(JSON.stringify({ grammar: await writeGrammarIndexes(folder, manifest) }));
