import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { DAUTOEIC_DIFFICULTY_BANDS, DAUTOEIC_SOURCE_VERSION } from "../src/lib/services/dautoeic-source.ts";
import { alignGoogleClock } from "./lib/google-clock.mjs";
import { archiveJson } from "./lib/firestore-json.mjs";
import { createJsonCommitter } from "./lib/firestore-commit.mjs";
import { mirrorDocuments } from "./lib/firestore-mirror.mjs";

const [mode = "inspect", expectedProject, inputFile] = process.argv.slice(2);
if (!["inspect", "refresh", "sync", "export", "archive", "download", "publish"].includes(mode)) throw new Error("Use inspect, download, publish, refresh, sync, export, or archive followed by the expected Firebase project ID.");
let account;
try {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.replace(/^file:\/*(?=[A-Za-z]:)/, "");
  const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (configuredPath ? await readFile(configuredPath, "utf8") : "{}");
  account = JSON.parse(credentialJson);
} catch {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is invalid.");
}
if (!account.project_id) throw new Error("Production Firestore credentials are missing.");
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID !== account.project_id) throw new Error("Firebase project configuration does not match the credential.");
if (mode !== "inspect" && expectedProject !== account.project_id) throw new Error("Pass the expected Firebase project ID before syncing or exporting.");
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(account);

const clock = await alignGoogleClock();
console.log(JSON.stringify({ processClockAdjustmentMinutes: Math.round(clock.offsetMs / 60_000), windowsClockChanged: false }));
const credential = cert(account);
const db = getFirestore(initializeApp({ credential }));
db.settings({ preferRest: true });
const commitDocuments = createJsonCommitter(account.project_id, credential);
const key = (...parts) => [DAUTOEIC_SOURCE_VERSION, ...parts].join("__");
const mirror = db.collection("dauToeicMirror");
const syncStatus = db.collection("dauToeicSyncStatus").doc(key("weeklyMirror"));

async function inspect() {
  const status = (await syncStatus.get()).data() ?? null;
  console.log(JSON.stringify({ project: account.project_id, sourceVersion: DAUTOEIC_SOURCE_VERSION, status }, null, 2));
  const docs = await db.getAll(...[1, 2, 3, 4, 5, 6, 7].map((part) => mirror.doc(key(part <= 4 ? "listening" : "reading", "levels", part))));
  for (const doc of docs) console.log(JSON.stringify({ key: doc.id, exists: doc.exists, counts: doc.get("payload")?.map((level) => level.total), syncedAt: doc.get("syncedAtIso") }));
}

async function sync() {
  if (process.env.DAUTOEIC_SUPABASE_URL !== "https://odlnhfaygiotcyehuysw.supabase.co" || !process.env.DAUTOEIC_ANON_KEY?.startsWith("sb_publishable_")) throw new Error("This importer requires the current Dau English public connection.");
  process.env.NEXT_RUNTIME = "";
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, fsCache: false });
  const { runDauToeicMirrorSync } = await jiti.import("../src/lib/services/dautoeic-sync.ts");
  const previous = (await syncStatus.get()).data();
  if (previous?.status === "running" && Date.now() - previous.updatedAtMs < 120_000) throw new Error("A recent sync may still be running; wait before starting another writer.");
  if (mode === "refresh") await syncStatus.set({ status: "idle", cursor: 0, errors: [], cycleId: null }, { merge: true });
  let previousCursor = -1;
  for (let call = 1; call <= 60; call++) {
    const result = await runDauToeicMirrorSync({ force: true, budgetMs: 30_000 });
    console.log(JSON.stringify({ call, cursor: result.cursor, totalTasks: result.totalTasks, processed: result.processed, completed: result.completed, errors: result.errors }));
    if (result.errors?.length) throw new Error("Sync encountered errors; stopping instead of repeatedly consuming quota.");
    if (result.completed) {
      if (result.errors?.length) throw new Error("Sync completed with errors; data has not been certified complete.");
      return;
    }
    if (!result.started || result.cursor <= previousCursor) throw new Error("Sync stopped making progress; inspect the persisted cursor before resuming.");
    previousCursor = result.cursor;
  }
  throw new Error("Sync reached the bounded request limit; rerun to resume the stored cursor.");
}

async function readPayload(doc) {
  if (!doc.exists) throw new Error(`Missing Firestore material: ${doc.id}`);
  const data = doc.data();
  const chunkCount = data.chunkCount ?? 0;
  if (!Number.isInteger(chunkCount) || chunkCount < 0 || chunkCount > 1000) throw new Error(`Invalid chunk count: ${doc.id}`);
  const kind = data.chunked ? "jsonChunks" : "chunks";
  const chunks = [];
  for (let offset = 0; offset < chunkCount; offset += 50) {
    const refs = Array.from({ length: Math.min(50, chunkCount - offset) }, (_, index) => doc.ref.collection(kind).doc(String(offset + index).padStart(4, "0")));
    for (const chunk of await db.getAll(...refs)) {
      if (!chunk.exists) throw new Error(`Missing Firestore chunk: ${chunk.ref.path}`);
      chunks.push(chunk.data());
    }
  }
  if (data.chunked) return JSON.parse(chunks.map((chunk) => chunk.text).join(""));
  if (data.kind === "difficulty-session") {
    const items = chunks.flatMap((chunk) => chunk.items ?? []);
    if (items.length !== data.itemCount || items.length !== data.payload?.total) throw new Error(`Session count mismatch: ${doc.id}`);
    return { ...data.payload, items };
  }
  if (data.payload == null) throw new Error(`Missing JSON payload: ${doc.id}`);
  return data.payload;
}

async function exportVerified() {
  const status = (await syncStatus.get()).data();
  if (status?.status !== "success" || status.errors?.length) throw new Error("The Firestore sync is not complete; refusing to label the export as verified.");
  const tests = await readPayload(await mirror.doc(key("tests", "all")).get());
  if (!Array.isArray(tests) || tests.length === 0) throw new Error("The mirrored test catalog is empty.");
  const expectedKeys = [key("sets", "all"), key("tests", "all")];
  for (const test of tests) {
    expectedKeys.push(key("test", test.id));
    for (let part = 1; part <= 7; part++) expectedKeys.push(key("test-part", test.id, part));
  }
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    expectedKeys.push(key(skill, "levels", part));
    for (const band of DAUTOEIC_DIFFICULTY_BANDS) expectedKeys.push(key(skill, "session", part, band.level, "all"));
  }
  const materials = [];
  for (let offset = 0; offset < expectedKeys.length; offset += 10) {
    const docs = await db.getAll(...expectedKeys.slice(offset, offset + 10).map((name) => mirror.doc(name)));
    for (const doc of docs) {
      if (doc.get("syncedAtMs") < status.lastStartedAtMs) throw new Error(`Material predates the current sync: ${doc.id}`);
      materials.push({ key: doc.id, kind: doc.get("kind"), syncedAt: doc.get("syncedAtIso"), payload: await readPayload(doc) });
    }
  }
  return saveSnapshot({ source: "https://dauenglish.com", sourceVersion: DAUTOEIC_SOURCE_VERSION, firestoreProject: account.project_id, syncedAt: new Date(status.lastFinishedAtMs).toISOString(), materials }, mode !== "export");
}

function verifyMaterials(materials) {
  const byKey = new Map(materials.map((entry) => [entry.key, entry.payload]));
  const tests = byKey.get(key("tests", "all"));
  if (!Array.isArray(tests) || tests.length === 0 || new Set(tests.map((test) => test.id)).size !== tests.length) throw new Error("Invalid test catalog.");
  const expectedKeys = [key("sets", "all"), key("tests", "all")];
  for (const test of tests) {
    expectedKeys.push(key("test", test.id));
    for (let part = 1; part <= 7; part++) expectedKeys.push(key("test-part", test.id, part));
  }
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    expectedKeys.push(key(skill, "levels", part));
    for (const band of DAUTOEIC_DIFFICULTY_BANDS) expectedKeys.push(key(skill, "session", part, band.level, "all"));
  }
  if (byKey.size !== materials.length || materials.length !== expectedKeys.length || expectedKeys.some((name) => !byKey.has(name))) throw new Error("Incomplete or duplicate material catalog.");
  const partCounts = [];
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    const levels = byKey.get(key(skill, "levels", part));
    if (!Array.isArray(levels) || levels.length !== DAUTOEIC_DIFFICULTY_BANDS.length || DAUTOEIC_DIFFICULTY_BANDS.some((band) => levels.filter((level) => level.level === band.level).length !== 1)) throw new Error(`Invalid difficulty levels: Part ${part}`);
    for (const level of levels) {
      const session = byKey.get(key(skill, "session", part, level.level, "all"));
      const itemIds = new Set(level.itemIds);
      const sessionIds = new Set(session.items.map((item) => item.id));
      if (itemIds.size !== level.total || sessionIds.size !== level.total || session.items.length !== level.total || session.items.some((item) => !itemIds.has(item.id))) throw new Error(`Level/session membership mismatch: Part ${part}, Level ${level.level}`);
    }
    partCounts.push({ part, levels: levels.map((level) => level.total), items: levels.reduce((total, level) => total + level.total, 0) });
  }
  const questions = new Set();
  const passages = new Set();
  for (const material of materials.filter((entry) => entry.kind === "test-part")) {
    for (const question of material.payload.questions) questions.add(question.id);
    for (const passage of material.payload.passages) passages.add(passage.id);
  }
  for (const test of tests) {
    const count = Array.from({ length: 7 }, (_, index) => byKey.get(key("test-part", test.id, index + 1)).questions.length).reduce((total, size) => total + size, 0);
    if (count !== test.totalQuestions) throw new Error(`Question count mismatch: ${test.id}`);
  }
  return { tests: tests.length, questions: questions.size, passages: passages.size, firestoreMaterials: materials.length, partCounts };
}

async function saveSnapshot(snapshot, archive = false) {
  const counts = verifyMaterials(snapshot.materials);
  const syncedAtMs = Date.parse(snapshot.syncedAt);
  if (!Number.isFinite(syncedAtMs) || snapshot.source !== "https://dauenglish.com" || snapshot.sourceVersion !== DAUTOEIC_SOURCE_VERSION || snapshot.firestoreProject !== account.project_id) throw new Error("Snapshot source or project mismatch.");
  const json = JSON.stringify(snapshot);
  const folder = fileURLToPath(new URL(`../.seed-tmp/dauenglish/snapshot-${syncedAtMs}/`, import.meta.url));
  const output = path.join(folder, "materials.json");
  const manifest = { project: account.project_id, sourceVersion: DAUTOEIC_SOURCE_VERSION, ...counts, bytes: Buffer.byteLength(json, "utf8"), sha256: createHash("sha256").update(json).digest("hex"), output, firestoreSnapshot: null, snapshotVerified: false, firestoreMirrorVerified: false, media: "Original audio/image URLs only; media files are not copied." };
  await mkdir(folder, { recursive: true });
  await writeFile(output, json, "utf8");
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  if (archive) {
    try {
      Object.assign(manifest, await archiveJson(db, manifest, json, syncedAtMs, commitDocuments));
    } catch (error) {
      manifest.lastPublishError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      await writeFile(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    }
  }
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

async function download() {
  if (process.env.DAUTOEIC_SUPABASE_URL !== "https://odlnhfaygiotcyehuysw.supabase.co" || !process.env.DAUTOEIC_ANON_KEY?.startsWith("sb_publishable_")) throw new Error("The current Dau English public connection is required.");
  process.env.NEXT_RUNTIME = "";
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, fsCache: false });
  const source = await jiti.import("../src/lib/services/dautoeic.ts");
  const materials = [];
  const append = (name, kind, payload) => materials.push({ key: name, kind, syncedAt: new Date().toISOString(), payload });
  const tests = await source.fetchListTestsFromSource(null);
  append(key("sets", "all"), "sets", await source.fetchSetsFromSource());
  append(key("tests", "all"), "tests", tests);
  for (const test of tests) {
    append(key("test", test.id), "test", await source.fetchTestFromSource(test.id));
    for (let part = 1; part <= 7; part++) append(key("test-part", test.id, part), "test-part", await source.fetchPartFromSource(test.id, part));
    console.log(JSON.stringify({ downloaded: materials.length, test: test.name }));
  }
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    const levels = part <= 4 ? source.fetchListeningDifficultyLevelsFromSource : source.fetchReadingDifficultyLevelsFromSource;
    const session = part <= 4 ? source.fetchListeningDifficultySessionFromSource : source.fetchReadingDifficultySessionFromSource;
    append(key(skill, "levels", part), "difficulty-levels", await levels(part));
    for (const band of DAUTOEIC_DIFFICULTY_BANDS) append(key(skill, "session", part, band.level, "all"), "difficulty-session", await session(part, band.level, null));
    console.log(JSON.stringify({ downloaded: materials.length, part }));
  }
  await saveSnapshot({ source: "https://dauenglish.com", sourceVersion: DAUTOEIC_SOURCE_VERSION, firestoreProject: account.project_id, syncedAt: new Date().toISOString(), materials });
}

async function publish() {
  if (!inputFile) throw new Error("Pass the downloaded materials.json path after the expected project ID.");
  const snapshot = JSON.parse(await readFile(inputFile, "utf8"));
  const manifest = await saveSnapshot(snapshot, true);
  const ordered = [...snapshot.materials].sort((first, second) => Number(second.kind.startsWith("difficulty-")) - Number(first.kind.startsWith("difficulty-")));
  let written = 0;
  for (const material of ordered) {
    const previous = await mirror.doc(material.key).get();
    if (previous.get("snapshotHash") !== manifest.sha256) {
      const documents = mirrorDocuments(material, manifest.sha256);
      await commitDocuments(documents);
      written += documents.length;
    }
    const stored = await readPayload(await mirror.doc(material.key).get());
    if (JSON.stringify(stored) !== JSON.stringify(material.payload)) {
      const { isDeepStrictEqual } = await import("node:util");
      if (!isDeepStrictEqual(stored, material.payload)) throw new Error(`Mirror read-back mismatch: ${material.key}`);
    }
    console.log(JSON.stringify({ published: material.key, written }));
  }
  await commitDocuments([{ path: `dauToeicSyncStatus/${key("jsonMirror")}`, data: { status: "success", sourceVersion: DAUTOEIC_SOURCE_VERSION, totalTasks: ordered.length, cursor: ordered.length, snapshot: manifest.firestoreSnapshot, sha256: manifest.sha256, syncedAtMs: Date.parse(snapshot.syncedAt), verifiedAt: new Date(), canonicalCollectionsUpdated: false } }]);
  manifest.firestoreMirrorVerified = true;
  await writeFile(path.join(path.dirname(manifest.output), "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify({ complete: true, mirrorMaterialsVerified: ordered.length, written, snapshot: manifest.firestoreSnapshot }));
}

try {
  if (mode === "inspect") await inspect();
  if (mode === "download") await download();
  if (mode === "publish") await publish();
  if (mode === "sync" || mode === "refresh") await sync();
  if (["sync", "refresh", "export", "archive"].includes(mode)) await exportVerified();
} finally {
  await db.terminate();
  clock.restore();
}
