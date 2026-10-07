import { describe, expect, it } from "vitest";
import { vocabularyFixture } from "../../test/vocabulary-fixture";
import { vocabularySnapshotSchema } from "./vocab-snapshot";

describe("vocabulary snapshot authorization", () => {
  it("rejects Pro without provider authorization, including explicit public scope", () => {
    const snapshot = vocabularyFixture();
    snapshot.catalog.tests[0].accessLevel = " Pro ";
    expect(vocabularySnapshotSchema.safeParse(snapshot).success).toBe(false);
    expect(vocabularySnapshotSchema.safeParse({ ...snapshot, accessScope: "public" }).success).toBe(false);
  });

  it("keeps Pro metadata when authorized while still enforcing membership and counts", () => {
    const snapshot = vocabularyFixture();
    snapshot.accessScope = "provider-authorized";
    snapshot.catalog.tests[0].accessLevel = "pro";
    expect(vocabularySnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(vocabularySnapshotSchema.safeParse({ ...snapshot, words: snapshot.words.slice(1) }).success).toBe(false);
    expect(vocabularySnapshotSchema.safeParse({ ...snapshot, parts: [{ ...snapshot.parts[0], testId: "unknown" }, snapshot.parts[1]] }).success).toBe(false);
  });

  it("does not accept an unrecognized authorization scope", () => {
    expect(vocabularySnapshotSchema.safeParse({ ...vocabularyFixture(), accessScope: "pro" }).success).toBe(false);
  });
});
