import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDrivePackage } from "./lib/drive-package.mjs";
import { regroupPracticeSnapshot } from "./lib/practice-groups.mjs";

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length || path.resolve(input) === path.resolve(output)) throw new Error("Use regroup-dauenglish.mjs <source-materials.json> <new-materials.json>; the source is never overwritten.");
const original = await readFile(input, "utf8");
buildDrivePackage(original);
const grouped = regroupPracticeSnapshot(JSON.parse(original));
const json = JSON.stringify(grouped);
const prepared = buildDrivePackage(json);
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, json, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ output: path.resolve(output), ...prepared.counts, groups: grouped.materials.filter((material) => material.kind === "difficulty-levels").map((material) => ({ part: material.payload[0].part, grouping: material.payload[0].grouping ?? "source", counts: material.payload.map((level) => level.total) })) }, null, 2));
