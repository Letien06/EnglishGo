import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/response";
import { grammarFixture } from "../../test/grammar-fixture";
const mocks = vi.hoisted(() => ({ enabled: true, read: vi.fn() }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => mocks.enabled, readDriveMaterial: mocks.read }));
import { getGrammarAnswerKeys, getGrammarCatalog, getGrammarTopic } from "./dautoeic-grammar";
beforeEach(() => {
  mocks.enabled = true; mocks.read.mockReset();
  const { catalog, topic } = grammarFixture();
  mocks.read.mockImplementation(async (key: string) => structuredClone(key.endsWith("__catalog") ? catalog : topic));
});
describe("grammar Drive reader", () => {
  it("loads a lightweight answer index with at most three concurrent topic reads", async () => {
    const fixture = grammarFixture();
    const catalog = { ...fixture.catalog, topics: Array.from({ length: 7 }, (_, index) => ({ ...fixture.catalog.topics[0], id: `topic-${index}`, slug: `topic-${index}`, subtopics: fixture.catalog.topics[0].subtopics.map(subtopic => ({ ...subtopic, id: `subtopic-${index}` })) })) };
    let active = 0;
    let maxActive = 0;
    mocks.read.mockImplementation(async (key: string) => {
      if (key.endsWith("__catalog")) return structuredClone(catalog);
      const id = key.split("__").pop()!;
      const index = id.replace("topic-", "");
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return { ...fixture.topic, topicId: id, questions: fixture.topic.questions.map(question => ({ ...question, id: `question-${index}`, topicId: id, subtopicId: `subtopic-${index}` })) };
    });
    const keys = await getGrammarAnswerKeys(catalog);
    expect(maxActive).toBe(3);
    expect(Object.keys(keys)).toEqual(catalog.topics.map(topic => topic.id));
    expect(keys["topic-0"]).toEqual({ "question-0": fixture.topic.questions[0].answer });
    expect(JSON.stringify(keys)).not.toContain(fixture.topic.questions[0].text);
    expect(Object.values(keys).flatMap(key => Object.values(key)).every(letter => /^[A-D]$/.test(letter))).toBe(true);
    expect(mocks.read.mock.calls.filter(([key]) => !key.endsWith("__catalog"))).toHaveLength(7);
  });
  it("does not replace unavailable or mismatched answer material with an empty index", async () => {
    const catalog = grammarFixture().catalog;
    mocks.enabled = false;
    await expect(getGrammarAnswerKeys(catalog)).rejects.toThrow(/unavailable/);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.enabled = true;
    const mismatched = structuredClone(catalog);
    mismatched.topics[0].questionCount += 1;
    await expect(getGrammarAnswerKeys(mismatched)).rejects.toThrow(/membership/);
  });
  it("resolves slug or original ID with authorized contents intact", async () => {
    expect(await getGrammarTopic("nouns")).toEqual(grammarFixture().topic);
    expect(await getGrammarTopic("1")).toEqual(grammarFixture().topic);
    expect(mocks.read).toHaveBeenCalledWith("dauenglish-v2__grammar__topic__1");
  });
  it("returns null for optional old bundles but propagates corruption and auth/storage errors", async () => {
    mocks.read.mockRejectedValue(new ApiError("Missing", 404));
    expect(await getGrammarCatalog()).toBeNull();
    mocks.read.mockRejectedValue(new ApiError("Unavailable", 503));
    await expect(getGrammarCatalog()).rejects.toMatchObject({ status: 503 });
    mocks.read.mockResolvedValue({ ...grammarFixture().catalog, accessScope: "public" });
    await expect(getGrammarCatalog()).rejects.toThrow();
    mocks.enabled = false;
    mocks.read.mockClear();
    expect(await getGrammarTopic("1")).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
