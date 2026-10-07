import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/response";
import { dictationFixture } from "../../test/dictation-fixture";

const mocks = vi.hoisted(() => ({ enabled: true, read: vi.fn() }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => mocks.enabled, readDriveMaterial: mocks.read }));
import { getDictationCatalog, getDictationSet } from "./dautoeic-dictation";

beforeEach(() => {
  mocks.enabled = true;
  mocks.read.mockReset();
  const { catalog, set } = dictationFixture();
  mocks.read.mockImplementation(async (key: string) => structuredClone(key.endsWith("__catalog") ? catalog : set));
});

describe("dictation from verified Drive materials", () => {
  it("loads original source IDs and preserves provider-authorized Pro content", async () => {
    const catalog = await getDictationCatalog();
    expect(catalog.sets[0].accessLevel).toBe("pro");
    expect(await getDictationSet("set-1")).toEqual(dictationFixture().set);
    expect(mocks.read).toHaveBeenCalledWith("dauenglish-v2__dictation__set__set-1");
  });
  it("keeps pre-dictation bundles usable and missing lessons return 404", async () => {
    mocks.read.mockRejectedValue(new ApiError("Missing optional material", 404));
    expect((await getDictationCatalog()).sets).toEqual([]);
    await expect(getDictationSet("set-1")).rejects.toMatchObject({ status: 404 });
    mocks.enabled = false;
    mocks.read.mockClear();
    expect((await getDictationCatalog()).sets).toEqual([]);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not hide corruption or unavailable storage behind an empty catalog", async () => {
    mocks.read.mockRejectedValue(new ApiError("Unavailable", 503));
    await expect(getDictationCatalog()).rejects.toMatchObject({ status: 503 });
    const { catalog } = dictationFixture();
    mocks.read.mockResolvedValue({ ...catalog, accessScope: "public" });
    await expect(getDictationCatalog()).rejects.toThrow();
  });
  it("checks set identity and counts against the catalog before serving transcript", async () => {
    const { catalog, set } = dictationFixture();
    set.setId = "other";
    set.items[0].setId = "other";
    mocks.read.mockImplementation(async (key: string) => key.endsWith("__catalog") ? catalog : set);
    await expect(getDictationSet("set-1")).rejects.toThrow("identity");
  });
});
