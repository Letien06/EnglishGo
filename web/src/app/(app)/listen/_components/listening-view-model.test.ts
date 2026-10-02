import { describe, expect, it } from "vitest";
import type { DauToeicPartTest } from "@/types/dautoeic";
import { estimatedMinutes, filterTests, listeningMetadata, practiceHref, resumePosition, summarizeTests, testProgress } from "./listening-view-model";

const test: DauToeicPartTest = { testId: "vol1-test1", testName: "Test 1", setName: "Bộ đề 1", part: 1, questionCount: 6, itemCount: 6, done: 2, correct: 1, wrong: 1, nextIndex: 2 };

describe("listening presentation model", () => {
  it("uses source years and difficulty only in the view model", () => {
    const source = [{ id: "vol1-test1", year: 2024, difficultyLevel: 3, isHidden: false }, { id: "test2", year: 2026, difficultyLevel: 2, isHidden: false }, { id: "hidden", year: 2027, difficultyLevel: null, isHidden: true }];
    const metadata = listeningMetadata(source);
    expect(metadata["vol1-test1"]).toEqual({ year: 2024, difficultyLevel: 3 });
    expect(metadata.hidden).toBeUndefined();
    const sorted = filterTests([test, { ...test, testId: "test2" }, { ...test, testId: "unknown" }], "all", "", "newest", metadata);
    expect(sorted.map((entry) => entry.testId)).toEqual(["test2", "vol1-test1", "unknown"]);
  });
  it("derives status, progress and accuracy from real answers", () => {
    expect(testProgress(test)).toEqual({ done: 2, total: 6, percent: 33, remaining: 4, status: "learning" });
    expect(summarizeTests([test])).toMatchObject({ done: 2, total: 6, accuracy: 50 });
    expect(testProgress({ ...test, done: 8 }).percent).toBe(100);
    expect(testProgress({ ...test, questionCount: 0 }).status).toBe("new");
    expect(summarizeTests([]).accuracy).toBeNull();
  });
  it("preserves the zero-based route and distinguishes listening groups from questions", () => {
    expect(practiceHref(test)).toBe("/listen/practice?part=part1&testId=vol1-test1&mode=normal&q=2");
    expect(resumePosition(test)).toBe("câu 3/6");
    expect(resumePosition({ ...test, part: 3, questionCount: 39, itemCount: 13 })).toBe("cụm 3/13");
    expect(estimatedMinutes(test)).toBe(4);
  });
  it("filters accent-insensitively and sorts a copy without changing the catalog", () => {
    const catalog = [test, { ...test, testId: "test2", testName: "Test 2", done: 6 }];
    expect(filterTests(catalog, "learning", "bo de", "catalog")).toEqual([test]);
    expect(filterTests(catalog, "all", "", "progress-desc")[0].testId).toBe("test2");
    expect(filterTests(catalog, "all", "không có", "catalog")).toEqual([]);
    expect(catalog[0]).toBe(test);
  });
});
