import { describe, expect, it } from "vitest";
import { mergeTranscriptCues, parseTranscript } from "./transcript";

describe("transcript parser", () => {
  it("parses VTT timestamps and removes inline tags", () => {
    expect(parseTranscript("WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello <i>world</i>\n")).toEqual([
      { startSeconds: 1, endSeconds: 3.5, text: "Hello world" },
    ]);
  });

  it("merges adjacent cues within the target duration", () => {
    expect(mergeTranscriptCues([
      { startSeconds: 0, endSeconds: 2, text: "Hello" },
      { startSeconds: 2.2, endSeconds: 4, text: "there" },
    ])).toEqual([{ startSeconds: 0, endSeconds: 4, text: "Hello there" }]);
  });
});
