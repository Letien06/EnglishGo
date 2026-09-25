import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  collection: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/firestore/db", () => ({
  adminDb: {
    collection: database.collection,
    batch: () => ({ set: database.set, commit: database.commit }),
  },
}));
vi.mock("./dautoeic", () => ({ routeTestId: () => 123 }));

import { DAUTOEIC_SOURCE_VERSION } from "./dautoeic-source";
import { mirrorKey, readSyncStatus, writeSyncStatus } from "./dautoeic-mirror";
import { hasTestIndex } from "./dautoeic-test-index";
import {
  readCanonicalPart,
  readCanonicalSets,
  readCanonicalTestByRouteId,
  readCanonicalTests,
  writeCanonicalSets,
} from "./dautoeic-canonical";

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    doc: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: database.get,
    set: database.set,
  };
  database.collection.mockReturnValue(query);
  database.commit.mockResolvedValue(undefined);
  database.set.mockResolvedValue(undefined);
});

function snapshot(data: Record<string, unknown>) {
  return { exists: true, get: (key: string) => data[key], data: () => data };
}

describe("Dau English cache migration", () => {
  it("uses new mirror keys without changing stored learner IDs", () => {
    expect(mirrorKey("listening", "session", 1, 1, null)).toBe(
      `${DAUTOEIC_SOURCE_VERSION}__listening__session__1__1__all`,
    );
  });

  it("starts a separate weekly sync instead of reusing the old cursor", async () => {
    database.get.mockResolvedValue({ exists: false });
    await readSyncStatus();
    await writeSyncStatus({ status: "running" });
    expect(database.collection.mock.results[0].value.doc).toHaveBeenCalledWith(
      `${DAUTOEIC_SOURCE_VERSION}__weeklyMirror`,
    );
  });

  it("uses a source-specific test index with the existing collection ID", async () => {
    database.get.mockResolvedValue({ empty: true });
    await expect(hasTestIndex()).resolves.toBe(false);
    expect(database.collection).toHaveBeenCalledWith(
      `dauToeicSources/${DAUTOEIC_SOURCE_VERSION}/dauToeicTestIndex`,
    );
  });

  it("does not reuse the old canonical test catalog", async () => {
    database.get.mockResolvedValue(snapshot({ complete: true }));
    await expect(readCanonicalTests()).resolves.toEqual([]);
    expect(database.get).toHaveBeenCalledTimes(1);
  });

  it("does not reuse old canonical test details", async () => {
    database.get.mockResolvedValue(snapshot({ source: "DAUTOEIC", id: "test" }));
    await expect(readCanonicalTestByRouteId(123)).resolves.toBeNull();
  });

  it("does not reuse old part metadata after the catalog has been refreshed", async () => {
    database.get.mockResolvedValue(snapshot({
      source: "DAUTOEIC",
      sourceVersion: DAUTOEIC_SOURCE_VERSION,
      parts: { "1": { questionIds: [123] } },
    }));
    await expect(readCanonicalPart(123, 1)).resolves.toBeNull();
  });

  it("returns only current-source canonical sets", async () => {
    database.get.mockResolvedValue({ docs: [
      snapshot({ externalId: "old", name: "Old" }),
      snapshot({ externalId: "new", name: "New", sourceVersion: DAUTOEIC_SOURCE_VERSION }),
    ] });
    const sets = await readCanonicalSets();
    expect(sets.map((set) => set.id)).toEqual(["new"]);
  });

  it("stamps refreshed sets without deleting existing data", async () => {
    await writeCanonicalSets([{ id: "new", name: "New", description: null, orderIndex: 1 }]);
    expect(database.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceVersion: DAUTOEIC_SOURCE_VERSION, externalId: "new" }),
      { merge: true },
    );
  });
});
