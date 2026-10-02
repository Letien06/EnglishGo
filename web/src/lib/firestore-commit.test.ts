import { describe, expect, it, vi } from "vitest";
import { createJsonCommitter, firestoreValue } from "../../scripts/lib/firestore-commit.mjs";

describe("bounded material-only Firestore writes", () => {
  it("encodes JSON and timestamps without losing Unicode or empty collections", () => {
    expect(firestoreValue({ text: "Tiếng Việt 🎧", total: 4000, rate: 0.25, active: true, empty: null, items: [], nested: {}, at: new Date(0) })).toEqual({
      mapValue: { fields: {
        text: { stringValue: "Tiếng Việt 🎧" }, total: { integerValue: "4000" }, rate: { doubleValue: 0.25 },
        active: { booleanValue: true }, empty: { nullValue: null }, items: { arrayValue: { values: [] } },
        nested: { mapValue: { fields: {} } }, at: { timestampValue: "1970-01-01T00:00:00.000Z" },
      } },
    });
    expect(() => firestoreValue(undefined)).toThrow("finite JSON");
    expect(() => firestoreValue(Infinity)).toThrow("finite JSON");
  });

  it("stops immediately on quota errors rather than retrying for ten minutes", async () => {
    const credential = { getAccessToken: vi.fn().mockResolvedValue({ access_token: "test-token" }) };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded." } }), { status: 429 }));
    const commit = createJsonCommitter("test-project", credential, fetcher);
    await expect(commit([{ path: "dauEnglishSnapshots/test", data: { status: "writing" } }])).rejects.toThrow("Firestore 429: RESOURCE_EXHAUSTED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refuses writes to learner collections before acquiring credentials", async () => {
    const credential = { getAccessToken: vi.fn() };
    const fetcher = vi.fn();
    const commit = createJsonCommitter("test-project", credential, fetcher);
    for (const path of ["users/test", "attempts/test", "dauToeicMirror/../users/test", "dauToeicMirror/test/chunks"]) {
      await expect(commit([{ path, data: {} }])).rejects.toThrow("material collections");
    }
    expect(credential.getAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses create preconditions and explicit merge masks", async () => {
    const credential = { getAccessToken: vi.fn().mockResolvedValue({ access_token: "test-token" }) };
    const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
    await createJsonCommitter("test-project", credential, fetcher)([
      { path: "dauEnglishSnapshots/test", data: { status: "writing" }, create: true },
      { path: "dauToeicSyncStatus/test", data: { status: "success" }, merge: true },
    ]);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents:commit");
    const { writes } = JSON.parse(options.body);
    expect(writes[0].currentDocument).toEqual({ exists: false });
    expect(writes[1].updateMask).toEqual({ fieldPaths: ["status"] });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
