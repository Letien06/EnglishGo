import { describe, expect, it } from "vitest";
import { collectSnapshotMedia, mediaStoragePath, rewriteSnapshotMedia, sha256Bytes, storageMetadataMatches } from "../../scripts/lib/media-storage.mjs";

describe("DauEnglish media storage", () => {
  it("builds stable paths from test, part and item identity", () => {
    expect(mediaStoragePath({ testId: "test/1", part: 1, itemType: "question", itemId: "question-1", mediaType: "image" }))
      .toBe("dauenglish/test-1/part-1/questions/question-1/image");
  });

  it("deduplicates repeated source URLs while retaining the first stable identity", () => {
    const snapshot = { materials: [{ kind: "test-part", payload: { test: { id: "test-1" }, part: 1, questions: [{ id: "q1", imageUrl: "https://media.test/a.jpg" }, { id: "q2", imageUrl: "https://media.test/a.jpg" }], passages: [] } }] };
    expect(collectSnapshotMedia(snapshot)).toHaveLength(1);
    expect(collectSnapshotMedia(snapshot)[0].storagePath).toContain("questions/q1/image");
  });

  it("rewrites every snapshot reference to the internal Storage URL", () => {
    const snapshot = { materials: [{ payload: { questions: [{ imageUrl: "https://media.test/a.jpg" }], nested: "https://media.test/a.jpg" } }] };
    const result = rewriteSnapshotMedia(snapshot, new Map([["https://media.test/a.jpg", { publicUrl: "https://firebasestorage.googleapis.com/internal" }]]));
    expect(result.rewritten).toBe(2);
    expect(result.snapshot.materials[0].payload.questions[0].imageUrl).toContain("firebasestorage");
  });

  it("calculates a content checksum", () => {
    const checksum = sha256Bytes(Buffer.from("EnglishGo"));
    expect(checksum).toBe("979860440684368739e58192316cf77ef8c2f063155521782b70c9fe31bc5ddd");
    expect(storageMetadataMatches({ size: 9, metadata: { sha256: checksum } }, checksum, 9)).toBe(true);
    expect(storageMetadataMatches({ size: 8, metadata: { sha256: checksum } }, checksum, 9)).toBe(false);
  });
});

