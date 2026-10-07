import { describe, expect, it } from "vitest";
import { dictationFixture } from "../../test/dictation-fixture";
import { dictationCatalogSchema, dictationSetSchema, validateDictationSetMembership } from "./dictation-snapshot";

describe("authorized dictation schema", () => {
  it("retains Pro, original identities, transcript and audio metadata", () => {
    const { catalog, set } = dictationFixture();
    expect(dictationCatalogSchema.parse(catalog)).toEqual(catalog);
    expect(dictationSetSchema.parse(set)).toEqual(set);
    expect(() => validateDictationSetMembership(catalog, set)).not.toThrow();
  });
  it.each(["missing-scope", "wrong-source", "duplicate-id", "wrong-set", "relative-audio", "empty-transcript"])("rejects %s dictation items", (issue) => {
    const { set } = dictationFixture();
    const value: Record<string, unknown> = { ...set };
    if (issue === "missing-scope") delete value.accessScope;
    if (issue === "wrong-source") value.source = "https://other.example";
    if (issue === "duplicate-id") set.items.push(set.items[0]);
    if (issue === "wrong-set") set.items[0].setId = "other";
    if (issue === "relative-audio") set.items[0].audioUrl = "audio.mp3";
    if (issue === "empty-transcript") set.items[0].transcript = "  ";
    expect(dictationSetSchema.safeParse(value).success).toBe(false);
  });
  it("rejects unknown chapters and mismatched catalog counts", () => {
    const { catalog, set } = dictationFixture();
    catalog.sets[0].chapterName = "Missing";
    expect(dictationCatalogSchema.safeParse(catalog).success).toBe(false);
    catalog.sets[0].itemCount = 2;
    expect(() => validateDictationSetMembership(catalog, set)).toThrow();
  });
  it("retains explicitly marked missing source transcripts without allowing inconsistent markers", () => {
    const { set } = dictationFixture();
    set.items[0].transcript = "";
    set.items[0].transcriptMissing = true;
    expect(dictationSetSchema.parse(set)).toEqual(set);
    set.items[0].transcript = "Available transcript.";
    expect(dictationSetSchema.safeParse(set).success).toBe(false);
  });
});
