import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ drive: vi.fn(), firestore: vi.fn(() => { throw new Error("Content must not touch Firestore in Drive mode"); }) }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: unknown) => callback }));
vi.mock("@/lib/firestore/db", () => ({ adminDb: { collection: mocks.firestore, batch: mocks.firestore } }));
vi.mock("./dautoeic-drive", () => ({ isDriveContentEnabled: () => true, readDriveMaterial: mocks.drive, contentCacheKey: () => "drive-routing-test" }));

import { getDifficultySession, getPart, getReadingDifficultySession, getTest, listDifficultyLevels, listReadingDifficultyLevels, listSets, listTests } from "./dautoeic";
import { runDauToeicMirrorSync } from "./dautoeic-sync";
import { hasTestIndex, queryTestIndex, writeTestIndex } from "./dautoeic-test-index";

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Upstream must not be used"); })); });
afterEach(() => vi.unstubAllGlobals());

describe("Drive mode keeps material traffic out of Firestore", () => {
  it("routes catalogs, details, levels, and parts to Drive", async () => {
    mocks.drive.mockResolvedValue([{ id: "one", setId: "set1" }, { id: "two", setId: "set2" }]);
    await listSets();
    expect(await listTests("set2")).toEqual([{ id: "two", setId: "set2" }]);
    await getTest("one");
    await getPart("one", 7);
    await listDifficultyLevels(1);
    await listReadingDifficultyLevels(7);
    expect(mocks.drive.mock.calls.map(([key]) => key)).toEqual(["dauenglish-v2__sets__all", "dauenglish-v2__tests__all", "dauenglish-v2__test__one", "dauenglish-v2__test-part__one__7", "dauenglish-v2__listening__levels__1", "dauenglish-v2__reading__levels__7"]);
    expect(mocks.firestore).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("slices complete sessions locally and preserves empty levels", async () => {
    mocks.drive.mockResolvedValue({ total: 3, items: [{ id: "1" }, { id: "2" }, { id: "3" }] });
    expect(await getDifficultySession(1, 1, 2)).toMatchObject({ total: 2, items: [{ id: "1" }, { id: "2" }] });
    expect(mocks.drive).toHaveBeenCalledWith("dauenglish-v2__listening__session__1__1__all");
    mocks.drive.mockResolvedValue({ total: 0, items: [] });
    expect(await getReadingDifficultySession(7, 1, null)).toMatchObject({ total: 0, items: [] });
    expect(mocks.firestore).not.toHaveBeenCalled();
  });

  it("skips the Firestore sync even when a cron forces it", async () => {
    await expect(runDauToeicMirrorSync({ force: true })).resolves.toMatchObject({ started: false, skipped: true, reason: "google_drive_content_publish_with_cli" });
    expect(mocks.firestore).not.toHaveBeenCalled();
  });

  it("paginates and filters tests without creating a Firestore index", async () => {
    mocks.drive.mockResolvedValue([
      { id: "one", name: "Test 1", setName: "ETS", orderIndex: 1, difficultyLevel: 2 },
      { id: "two", name: "Test 2", setName: "ETS", orderIndex: 2, difficultyLevel: 2 },
      { id: "three", name: "Test 3", setName: "Crack", orderIndex: 3, difficultyLevel: 1 },
    ]);
    expect(await hasTestIndex()).toBe(true);
    await writeTestIndex([]);
    const first = await queryTestIndex({ size: 1, difficulty: "2", search: "ETS" });
    const second = await queryTestIndex({ size: 1, difficulty: "2", search: "ETS", cursor: first.nextCursor });
    expect(first.total).toBe(2);
    expect(first.tests[0].id).toBe("one");
    expect(second.tests[0].id).toBe("two");
    expect(second.nextCursor).toBeUndefined();
    expect(mocks.firestore).not.toHaveBeenCalled();
  });
});
