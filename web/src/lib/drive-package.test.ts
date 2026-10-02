import { describe, expect, it } from "vitest";
import { buildDrivePackage, sha256 } from "../../scripts/lib/drive-package.mjs";
import { vocabularyFixture } from "../test/vocabulary-fixture";

function fixture() {
  const materials: Array<{ key: string; kind: string; payload: unknown }> = [];
  const add = (key: string, kind: string, payload: unknown) => materials.push({ key: `dauenglish-v2__${key}`, kind, payload });
  const test = { id: "test", totalQuestions: 7 };
  add("sets__all", "sets", []);
  add("tests__all", "tests", [test]);
  add("test__test", "test", test);
  for (let part = 1; part <= 7; part++) {
    add(`test-part__test__${part}`, "test-part", { questions: [{ id: `question-${part}`, text: "Đề thi 🎧" }], passages: [] });
    const skill = part <= 4 ? "listening" : "reading";
    add(`${skill}__levels__${part}`, "difficulty-levels", [1, 2, 3, 4].map((level) => ({ level, total: 0, itemIds: [] })));
    for (let level = 1; level <= 4; level++) add(`${skill}__session__${part}__${level}__all`, "difficulty-session", { total: 0, items: [] });
  }
  return { source: "https://dauenglish.com", sourceVersion: "dauenglish-v2", syncedAt: "2026-10-02T12:00:00Z", materials };
}

describe("offline Drive material package", () => {
  it("preserves a complete vocabulary snapshot alongside the existing exams", () => {
    const snapshot = fixture();
    snapshot.materials.push({ key: "dauenglish-v2__vocabulary__all", kind: "vocabulary", payload: vocabularyFixture() });
    const result = buildDrivePackage(JSON.stringify(snapshot));
    expect(result.counts).toMatchObject({ tests: 1, questions: 7, materials: 46 });
    expect(result.manifest.entries["dauenglish-v2__vocabulary__all"].kind).toBe("vocabulary");
  });

  it.each(["missing", "duplicate", "wrong-part", "pro"])("rejects %s vocabulary before upload", (issue) => {
    const snapshot = fixture();
    const vocabulary = vocabularyFixture();
    if (issue === "missing") vocabulary.words.pop();
    if (issue === "duplicate") vocabulary.words[1].id = vocabulary.words[0].id;
    if (issue === "wrong-part") vocabulary.words[0].partId = "missing";
    if (issue === "pro") vocabulary.catalog.tests[0].accessLevel = "pro";
    snapshot.materials.push({ key: "dauenglish-v2__vocabulary__all", kind: "vocabulary", payload: vocabulary });
    expect(() => buildDrivePackage(JSON.stringify(snapshot))).toThrow();
  });
  it("deduplicates chunks and reconstructs every payload without losing Unicode", () => {
    const snapshot = fixture();
    const json = JSON.stringify(snapshot);
    const result = buildDrivePackage(json);
    expect(result.counts).toMatchObject({ tests: 1, questions: 7, materials: 45 });
    expect(result.files.size).toBeLessThan(snapshot.materials.length);
    expect(result.manifest.snapshotSha256).toBe(sha256(json));
    for (const material of snapshot.materials) {
      const entry = result.manifest.entries[material.key];
      const text = entry.chunks.map((chunk: { sha256: string }) => result.files.get(chunk.sha256)).join("");
      expect(JSON.parse(text)).toEqual(material.payload);
      expect(sha256(text)).toBe(entry.sha256);
    }
  });

  it("rejects a missing part instead of publishing an incomplete manifest", () => {
    const snapshot = fixture();
    snapshot.materials = snapshot.materials.filter((material) => material.key !== "dauenglish-v2__test-part__test__7");
    expect(() => buildDrivePackage(JSON.stringify(snapshot))).toThrow("Incomplete");
  });

  it("rejects duplicate material entries and incorrect declared question counts", () => {
    const duplicate = fixture();
    duplicate.materials.push(duplicate.materials[0]);
    expect(() => buildDrivePackage(JSON.stringify(duplicate))).toThrow("duplicate");
    const wrongCount = fixture();
    wrongCount.materials[1].payload = [{ id: "test", totalQuestions: 200 }];
    expect(() => buildDrivePackage(JSON.stringify(wrongCount))).toThrow("Question count mismatch");
  });
});
