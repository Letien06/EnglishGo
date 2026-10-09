import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "jiti";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { readDriveTextWithRetry } from "./lib/drive-download-retry.mjs";
import { writeGrammarIndexes } from "./lib/build-grammar-indexes.mjs";
import nextEnv from "@next/env";

// npm runs prebuild outside Next.js; load the same production env files here.
nextEnv.loadEnvConfig(process.cwd(), false);

const compress = promisify(gzip);

if (process.env.DAUTOEIC_CONTENT_STORAGE !== "google-drive") {
  console.log("[materials] Drive bundle not configured; using the runtime content provider.");
} else {
  const jiti = createJiti(import.meta.url, { fsCache: false });
  const { createDriveClient, driveFileId, DriveError } = await jiti.import("../src/lib/storage/google-drive.ts");
  const { driveManifestSchema } = await jiti.import("../src/lib/storage/drive-manifest.ts");
  const { decodeBundledMaterial } = await jiti.import("../src/lib/storage/bundled-material.ts");
  const { buildTestPartCatalogEntry, testPartCatalogIndexSchema } = await jiti.import("../src/lib/storage/test-part-catalog-index.ts");
  const client = createDriveClient({ clientId: process.env.GOOGLE_DRIVE_CLIENT_ID, clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET, refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const manifestId = driveFileId(process.env.GOOGLE_DRIVE_MANIFEST_ID ?? "");
  const folder = path.resolve(".content/dauenglish", manifestId);
  const manifestText = await readDriveTextWithRetry(client, manifestId, 1_000_000, { DriveError, timeoutMs: 90_000 });
  const manifest = driveManifestSchema.parse(JSON.parse(manifestText));
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  await mkdir(folder, { recursive: true });
  const entries = Object.values(manifest.entries);
  const catalogParts = Array.from({ length: 7 }, () => ({}));
  let next = 0;
  let completed = 0;
  let bytes = 0;
  async function prepare() {
    while (next < entries.length) {
      const entry = entries[next++];
      const output = path.join(folder, `${entry.sha256}.json.gz`);
      let text = await readFile(output).then((data) => decodeBundledMaterial(data, entry)).catch((error) => {
        if (error.code === "EACCES" || error.code === "EPERM") throw error;
        return null;
      });
      if (text === null) {
        const parts = [];
        for (const chunk of entry.chunks) {
          const value = await readDriveTextWithRetry(client, chunk.fileId, chunk.bytes, { DriveError, timeoutMs: 120_000 });
          if (Buffer.byteLength(value) !== chunk.bytes || hash(value) !== chunk.sha256) throw new Error("Content bundle chunk checksum mismatch.");
          parts.push(value);
        }
        text = parts.join("");
        if (Buffer.byteLength(text) !== entry.bytes || hash(text) !== entry.sha256) throw new Error("Content bundle material checksum mismatch.");
        await writeFile(output, await compress(text, { level: 9 }));
      }
      // Keep a tiny catalog index beside the full materials. The practice
      // dashboard only needs counts and IDs; loading every test-part JSON at
      // request time made the first page render O(number of tests * part size).
      if (entry.kind === "test-part") {
        const payload = JSON.parse(text);
        const projected = buildTestPartCatalogEntry(payload);
        if (!catalogParts[payload.part - 1]) throw new Error("Invalid catalog part.");
        catalogParts[payload.part - 1][payload.test.id] = projected;
      }
      bytes += Buffer.byteLength(text);
      completed++;
      if (completed % 40 === 0) console.log(`[materials] Verified ${completed}/${entries.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, prepare));
  await writeFile(path.join(folder, "manifest.json"), manifestText, "utf8");
  const grammar = await writeGrammarIndexes(folder, manifest);
  if (grammar) console.log(`[materials] Grammar projections: ${JSON.stringify(grammar)}`);
  for (let part = 1; part <= 7; part++) {
    const index = testPartCatalogIndexSchema.parse({ sourceVersion: manifest.sourceVersion, snapshotSha256: manifest.snapshotSha256, part, entries: catalogParts[part - 1] });
    await writeFile(path.join(folder, `catalog-part-${part}.json`), JSON.stringify(index), "utf8");
  }
  console.log(`[materials] Ready: ${completed} verified materials, ${(bytes / 1_000_000).toFixed(1)} MB. Server-only bundle; no runtime Drive round trip needed.`);
}
