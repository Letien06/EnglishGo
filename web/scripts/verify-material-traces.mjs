import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const manifestId = process.env.GOOGLE_DRIVE_MANIFEST_ID;
assert(manifestId, "Set GOOGLE_DRIVE_MANIFEST_ID to the bundle used for this build.");
const root = process.cwd();
const bundle = path.join(root, ".content", "dauenglish", manifestId);
const manifest = JSON.parse(await readFile(path.join(bundle, "manifest.json"), "utf8"));
for (let part = 1; part <= 7; part++) {
  const index = JSON.parse(await readFile(path.join(bundle, `catalog-part-${part}.json`), "utf8"));
  assert.equal(index.snapshotSha256, manifest.snapshotSha256);
  assert.equal(index.part, part);
  assert(Object.keys(index.entries).length > 0, `Part ${part} index is empty`);
}

for (const route of ["app/(app)/listen/page", "app/(app)/read/page", "app/api/listening/tests/route", "app/api/reading/tests/route"]) {
  const filename = path.join(root, ".next/server", `${route}.js.nft.json`);
  const trace = JSON.parse(await readFile(filename, "utf8"));
  const files = new Set(trace.files.map(file => path.resolve(path.dirname(filename), file)));
  for (let part = 1; part <= 7; part++) assert(files.has(path.join(bundle, `catalog-part-${part}.json`)), `${route}: missing Part ${part}`);
  for (const file of files) {
    assert(!/[/\\][a-f0-9]{64}\.json$/.test(file), `${route}: uncompressed duplicate ${file}`);
  }
  console.log(`[trace] ${route}: all seven catalog indexes present; no raw chunk duplicates`);
}

// Prerendered public HTML must not ship the study library as a dependency.
const app = await readdir(path.join(root, ".next/server/app"));
if (app.includes("page.js.nft.json")) {
  const trace = JSON.parse(await readFile(path.join(root, ".next/server/app/page.js.nft.json"), "utf8"));
  assert(!trace.files.some(file => file.includes(".content/dauenglish")), "Landing trace contains study materials");
}
