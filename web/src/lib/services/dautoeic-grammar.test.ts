import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/response";
import { grammarFixture } from "../../test/grammar-fixture";
const mocks = vi.hoisted(() => ({ enabled: true, read: vi.fn() }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => mocks.enabled, readDriveMaterial: mocks.read }));
import { getGrammarCatalog, getGrammarTopic } from "./dautoeic-grammar";
beforeEach(() => {
  mocks.enabled = true; mocks.read.mockReset();
  const { catalog, topic } = grammarFixture();
  mocks.read.mockImplementation(async (key: string) => structuredClone(key.endsWith("__catalog") ? catalog : topic));
});
describe("grammar Drive reader", () => {
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
