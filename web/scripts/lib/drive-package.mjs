import { createHash } from "node:crypto";
import { splitJsonText } from "./firestore-json.mjs";
import { DAUTOEIC_DIFFICULTY_BANDS, DAUTOEIC_SOURCE_VERSION } from "../../src/lib/services/dautoeic-source.ts";

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function buildDrivePackage(json) {
  const snapshot = JSON.parse(json);
  if (snapshot.source !== "https://dauenglish.com" || snapshot.sourceVersion !== DAUTOEIC_SOURCE_VERSION || !Array.isArray(snapshot.materials) || !Number.isFinite(Date.parse(snapshot.syncedAt))) throw new Error("Invalid Dau English snapshot.");
  const materials = new Map(snapshot.materials.map((material) => [material.key, material]));
  const key = (...parts) => [DAUTOEIC_SOURCE_VERSION, ...parts].join("__");
  const tests = materials.get(key("tests", "all"))?.payload;
  if (!Array.isArray(tests) || tests.length === 0 || new Set(tests.map((test) => test.id)).size !== tests.length) throw new Error("Missing or duplicate tests in the snapshot.");
  const expected = new Map([[key("tests", "all"), "tests"], [key("sets", "all"), "sets"]]);
  for (const test of tests) {
    expected.set(key("test", test.id), "test");
    for (let part = 1; part <= 7; part++) expected.set(key("test-part", test.id, part), "test-part");
  }
  for (let part = 1; part <= 7; part++) {
    const skill = part <= 4 ? "listening" : "reading";
    expected.set(key(skill, "levels", part), "difficulty-levels");
    for (const band of DAUTOEIC_DIFFICULTY_BANDS) expected.set(key(skill, "session", part, band.level, "all"), "difficulty-session");
    const levels = materials.get(key(skill, "levels", part))?.payload;
    if (!Array.isArray(levels) || levels.length !== DAUTOEIC_DIFFICULTY_BANDS.length) throw new Error(`Missing difficulty levels: Part ${part}`);
    for (const band of DAUTOEIC_DIFFICULTY_BANDS) {
      const level = levels.find((item) => item.level === band.level);
      const session = materials.get(key(skill, "session", part, band.level, "all"))?.payload;
      const ids = new Set(level?.itemIds);
      if (!session || !level || ids.size !== level.total || session.items?.length !== level.total || session.total !== level.total || new Set(session.items.map((item) => item.id)).size !== level.total || session.items.some((item) => !ids.has(item.id))) throw new Error(`Session membership mismatch: Part ${part}, Level ${band.level}`);
    }
  }
  if (materials.size !== snapshot.materials.length || materials.size !== expected.size || [...expected].some(([name, kind]) => materials.get(name)?.kind !== kind)) throw new Error("Incomplete or duplicate material snapshot.");
  const questions = new Set();
  const passages = new Set();
  for (const test of tests) {
    let count = 0;
    for (let part = 1; part <= 7; part++) {
      const payload = materials.get(key("test-part", test.id, part)).payload;
      if (!Array.isArray(payload.questions) || !Array.isArray(payload.passages)) throw new Error("Invalid test part.");
      count += payload.questions.length;
      for (const question of payload.questions) questions.add(question.id);
      for (const passage of payload.passages) passages.add(passage.id);
    }
    if (count !== test.totalQuestions) throw new Error(`Question count mismatch: ${test.id}`);
  }
  const files = new Map();
  const entries = Object.fromEntries(snapshot.materials.map((material) => {
    const payload = JSON.stringify(material.payload);
    const chunks = splitJsonText(payload).map((text) => {
      const digest = sha256(text);
      files.set(digest, text);
      return { sha256: digest, bytes: Buffer.byteLength(text) };
    });
    return [material.key, { kind: material.kind, sha256: sha256(payload), bytes: Buffer.byteLength(payload), chunks }];
  }));
  return {
    manifest: { formatVersion: 1, source: snapshot.source, sourceVersion: snapshot.sourceVersion, snapshotSha256: sha256(json), syncedAt: snapshot.syncedAt, entries },
    counts: { tests: tests.length, questions: questions.size, passages: passages.size, materials: materials.size, uniqueChunks: files.size, snapshotBytes: Buffer.byteLength(json) },
    files,
  };
}
