import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DauToeicPassage, DauToeicQuestion, DauToeicTest } from "@/types/dautoeic";

const mocks = vi.hoisted(() => ({ drive: vi.fn(), compact: vi.fn(async () => null), firestore: vi.fn(() => { throw new Error("Unexpected Firestore content read"); }) }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: { collection: mocks.firestore } }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => true, readDriveMaterial: mocks.drive, readDriveCatalogIndex: mocks.compact, contentCacheKey: () => "test-snapshot" }));

import { practiceSessionFromPart } from "./dautoeic";
import { getTestPartSession, listTestParts } from "./test-part-practice";

const testInfo = (id = "test-one", setName = "Vol 1", name = "Test 1") => ({ id, setName, name, difficultyLevel: 3, orderIndex: 1, isHidden: false }) as DauToeicTest;
const question = (id: string, number: number, part = 3, testId = "test-one", passageId: string | null = "passage") => ({
  id, testId, part, passageId, questionNumber: number, questionText: "Question", difficultyLevel: 3,
  audioUrl: "question.mp3", imageUrl: null, correctAnswer: "A",
}) as DauToeicQuestion;
const passage = (part = 3) => ({
  id: "passage", testId: "test-one", part, transcript: "Script", passageText: "Text one",
  passageText2: "Text two", passageText3: "Text three", audioUrl: "passage.mp3", imageUrl: "graphic.png",
}) as DauToeicPassage;
const content = (part = 3) => ({
  test: testInfo(), part, skill: part <= 4 ? "listening" as const : "reading" as const,
  passages: [passage(part)], questions: [question("q2", 33, part), question("q1", 32, part)],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.compact.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected upstream read"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("test-part practice content", () => {
  it.each([1, 2, 5])("keeps Part %i in source order with one question per item", (part) => {
    const source = content(part);
    source.questions.push(source.questions[0], question("foreign-test", 1, part, "other"), question("foreign-part", 2, 7));
    const session = practiceSessionFromPart(source);
    expect(session).toMatchObject({ testId: "test-one", testName: "Test 1", setName: "Vol 1", part, total: 2 });
    expect(session.items.map((item) => item.id)).toEqual(["q1", "q2"]);
    expect(session.items.every((item) => item.questions.length === 1)).toBe(true);
  });

  it.each([3, 4, 6, 7])("preserves complete Part %i passages, texts, media and question IDs", (part) => {
    const session = practiceSessionFromPart(content(part));
    expect(session.total).toBe(1);
    expect(session.items[0]).toMatchObject({
      id: "passage", itemType: "passage", sourceLevel: 3, audioUrl: "passage.mp3", imageUrl: "graphic.png",
    });
    expect(session.items[0].questions.map((entry) => entry.id)).toEqual(["q1", "q2"]);
    for (const text of ["Script", "Text one", "Text two", "Text three"]) expect(session.items[0].transcript).toContain(text);
  });

  it("does not borrow a passage from another test", () => {
    const source = content();
    source.passages[0].testId = "other";
    expect(() => practiceSessionFromPart(source)).toThrow("missing a referenced passage");
  });

  it("preserves HTML boundaries and encoded literals for a single client-side text conversion", () => {
    const source = content(7);
    source.passages[0].passageText = "<h2>Title &mdash; notice</h2><p>&lt;contact@example.test&gt;</p>";
    expect(practiceSessionFromPart(source).items[0].transcript).toContain(source.passages[0].passageText);
  });

  it("keeps a standalone question without a passage ID", () => {
    const source = content();
    source.questions = [question("standalone", 1, 3, "test-one", null)];
    expect(practiceSessionFromPart(source).items[0]).toMatchObject({ id: "standalone", itemType: "question", audioUrl: "question.mp3" });
  });

  it("separates identically named tests in different books and hides hidden tests", async () => {
    mocks.drive.mockImplementation(async (key: string) => {
      if (key.endsWith("tests__all")) return [testInfo("test-two", "Vol 2"), { ...testInfo("hidden"), isHidden: true }, testInfo()];
      const testId = key.split("__")[2];
      return { ...content(), test: testInfo(testId, testId === "test-two" ? "Vol 2" : "Vol 1"),
        passages: [{ ...passage(), testId }], questions: [question(testId + "-q1", 32, 3, testId)] };
    });
    const catalog = await listTestParts(3);
    expect(catalog.map((entry) => [entry.test.testId, entry.test.setName, entry.test.questionCount])).toEqual([["test-one", "Vol 1", 1], ["test-two", "Vol 2", 1]]);
    expect(catalog[1].items[0].questionIds).toEqual(["test-two-q1"]);
    expect(mocks.firestore).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the compact catalog index without opening full test-part materials", async () => {
    const indexedTest = testInfo("test-indexed", "Vol Index", "Test Indexed");
    mocks.drive.mockImplementation(async (key: string) => key.endsWith("tests__all") ? [indexedTest] : content());
    mocks.compact.mockResolvedValue({
      "test-indexed": {
        test: { testId: indexedTest.id, testName: indexedTest.name!, setName: indexedTest.setName!, part: 3, questionCount: 2, itemCount: 1, done: 0, correct: 0, wrong: 0, nextIndex: 0 },
        items: [{ id: "passage", questionIds: ["q1", "q2"] }],
      },
    } as never);
    const catalog = await listTestParts(3);
    expect(catalog[0].test.questionCount).toBe(2);
    expect(catalog[0].items).toEqual([{ id: "passage", questionIds: ["q1", "q2"] }]);
    expect(mocks.drive).toHaveBeenCalledTimes(1);
    expect(mocks.drive.mock.calls[0][0]).toContain("tests__all");
  });

  it.each([["../test", 1], ["test", 0], ["test", 1.5], ["test", 8]] as const)("rejects invalid coordinates %s/%s before I/O", async (testId, part) => {
    await expect(getTestPartSession(testId, part)).rejects.toMatchObject({ status: 400 });
    expect(mocks.drive).not.toHaveBeenCalled();
  });

  it("rejects hidden or mismatched test data instead of showing another test", async () => {
    mocks.drive.mockResolvedValue(content());
    await expect(getTestPartSession("other", 3)).rejects.toMatchObject({ status: 404 });
    await expect(getTestPartSession("test-one", 7)).rejects.toMatchObject({ status: 404 });
    mocks.drive.mockResolvedValue({ ...content(), test: { ...testInfo(), isHidden: true } });
    await expect(getTestPartSession("test-one", 3)).rejects.toMatchObject({ status: 404 });
  });
});

it.skipIf(!process.env.DAUENGLISH_VERIFY_BUNDLE)("verifies every test and passage in the actual local snapshot", async () => {
  const directory = path.resolve(process.env.DAUENGLISH_VERIFY_BUNDLE!);
  const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")) as { entries: Record<string, { sha256: string }> };
  const read = (key: string) => JSON.parse(readFileSync(path.join(directory, manifest.entries[key].sha256 + ".json"), "utf8"));
  mocks.drive.mockImplementation(async (key: string) => read(key));
  const tests = read("dauenglish-v2__tests__all") as DauToeicTest[];
  expect(tests).toHaveLength(20);
  const expectedCounts = [6, 25, 39, 30, 30, 16, 54];
  const seen = new Set<string>();
  for (let part = 1; part <= 7; part++) {
    const catalog = await listTestParts(part);
    expect(catalog).toHaveLength(20);
    expect(catalog.reduce((total, entry) => total + entry.test.questionCount, 0)).toBe(expectedCounts[part - 1] * 20);
    for (const test of tests) {
      const source = read(`dauenglish-v2__test-part__${test.id}__${part}`) as ReturnType<typeof content>;
      const session = await getTestPartSession(test.id, part);
      const questions = session.items.flatMap((item) => item.questions);
      expect(questions).toHaveLength(expectedCounts[part - 1]);
      expect(questions.map((entry) => entry.id)).toEqual([...source.questions].sort((left, right) => left.questionNumber! - right.questionNumber!).map((entry) => entry.id));
      for (const entry of questions) {
        expect(entry.testId).toBe(test.id);
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
      for (const item of session.items) {
        const sourcePassage = source.passages.find((entry) => entry.id === item.id);
        if (sourcePassage) {
          expect(item.questions.map((entry) => entry.id).sort()).toEqual(source.questions.filter((entry) => entry.passageId === sourcePassage.id).map((entry) => entry.id).sort());
          if (part <= 4) expect(item.audioUrl).toBeTruthy();
          if (part >= 6) expect(item.transcript).toBeTruthy();
        }
      }
    }
  }
  expect(seen.size).toBe(4000);
  expect(mocks.firestore).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
