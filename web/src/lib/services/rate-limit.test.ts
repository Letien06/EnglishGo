import { beforeEach, describe, expect, it, vi } from "vitest";

const txGet = vi.fn();
const txSet = vi.fn();
const rateLimitDoc = {};
const doc = vi.fn(() => rateLimitDoc);
const subcollection = vi.fn(() => ({ doc }));
const userDoc = vi.fn(() => ({ collection: subcollection }));
const usersCollection = vi.fn(() => ({ doc: userDoc }));
const runTransaction = vi.fn(async (callback: (tx: { get: typeof txGet; set: typeof txSet }) => Promise<void>) => {
  await callback({ get: txGet, set: txSet });
});

vi.mock("@/lib/firestore/db", () => ({
  adminDb: {
    collection: vi.fn(() => usersCollection()),
    runTransaction,
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: vi.fn((value: number) => ({ increment: value })),
  },
}));

describe("enforceDailyActionLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-07-09T10:00:00.000Z"));
  });

  it("increments the current user action bucket under the limit", async () => {
    txGet.mockResolvedValue({ get: () => 2 });
    const { enforceDailyActionLimit } = await import("./rate-limit");

    await enforceDailyActionLimit("user-1", "ai-writing", 20);

    expect(doc).toHaveBeenCalledWith("ai-writing_2026-07-09");
    expect(txSet).toHaveBeenCalledWith(rateLimitDoc, expect.objectContaining({
      action: "ai-writing",
      dateKey: "2026-07-09",
      count: { increment: 1 },
    }), { merge: true });
  });

  it("rejects when the action bucket reaches the daily limit", async () => {
    txGet.mockResolvedValue({ get: () => 20 });
    const { enforceDailyActionLimit } = await import("./rate-limit");

    await expect(enforceDailyActionLimit("user-1", "ai-writing", 20))
      .rejects
      .toMatchObject({
        message: "Daily request limit reached",
        status: 429,
        headers: expect.objectContaining({
          "Retry-After": "50400",
          "RateLimit-Limit": "20",
        }),
      });
    expect(txSet).not.toHaveBeenCalled();
  });
});
