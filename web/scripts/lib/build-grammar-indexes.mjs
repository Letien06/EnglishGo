import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { createJiti } from "jiti";

export async function writeGrammarIndexes(folder, manifest) {
  const jiti = createJiti(import.meta.url, { fsCache: false });
  const { decodeBundledMaterial } = await jiti.import("../../src/lib/storage/bundled-material.ts");
  const { grammarCatalogSchema, grammarTopicSchema } = await jiti.import("../../src/lib/storage/grammar-snapshot.ts");
  const { buildGrammarIndexes } = await jiti.import("../../src/lib/storage/grammar-index.ts");
  const entries = Object.values(manifest.entries);
  const catalogEntry = entries.find(entry => entry.kind === "grammar-catalog");
  if (!catalogEntry) return null;
  const read = async entry => JSON.parse(await decodeBundledMaterial(await readFile(path.join(folder, `${entry.sha256}.json.gz`)), entry));
  const catalog = grammarCatalogSchema.parse(await read(catalogEntry));
  const topics = [];
  let sourceBytes = catalogEntry.bytes;
  for (const entry of entries.filter(entry => entry.kind === "grammar-topic")) {
    topics.push(grammarTopicSchema.parse(await read(entry)));
    sourceBytes += entry.bytes;
  }
  const indexes = buildGrammarIndexes(catalog, topics, manifest.snapshotSha256);
  const answers = JSON.stringify(indexes.answers);
  const dictionary = gzipSync(JSON.stringify(indexes.dictionary), { level: 9 });
  await writeFile(path.join(folder, "grammar-answers.json"), answers);
  await writeFile(path.join(folder, "grammar-dictionary.json.gz"), dictionary);
  return { sourceBytes, answerBytes: Buffer.byteLength(answers), dictionaryBytes: dictionary.length };
}
