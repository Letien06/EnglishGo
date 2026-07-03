import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/types";

const profileGet = vi.fn();
const practiceAttemptsGet = vi.fn();
const vocabProgressGet = vi.fn();

vi.mock("@/lib/firestore/db", () => ({
  adminDb: {
    collection: vi.fn((collectionName: string) => {
      if (collectionName !== "users") {
        throw new Error(`Unexpected collection ${collectionName}`);
      }
      return {
        doc: vi.fn(() => ({
          get: profileGet,
          collection: vi.fn((subcollectionName: string) => {
            if (subcollectionName === "practiceAttempts") {
              return { get: practiceAttemptsGet };
            }
            if (subcollectionName === "vocabProgress") {
              return { get: vocabProgressGet };
            }
            throw new Error(`Unexpected subcollection ${subcollectionName}`);
          }),
        })),
      };
    }),
  },
}));

const user: AppUser = {
  uid: "firebase-user",
  firebaseUid: "firebase-user",
  email: "learner@example.com",
  displayName: "Learner",
  avatarUrl: null,
  role: "STUDENT",
  level: null,
  targetScore: null,
  createdAtMillis: null,
  updatedAtMillis: null,
};

describe("getHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileGet.mockResolvedValue({
      exists: true,
      data: () => ({
        displayName: "Learner",
        targetScore: 750,
        level: "B1",
      }),
    });
    practiceAttemptsGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            score: 85,
            submittedAtMillis: Date.now(),
          }),
        },
      ],
    });
    vocabProgressGet.mockResolvedValue({
      docs: [
        { data: () => ({ status: "MASTERED" }) },
        { data: () => ({ status: "LEARNING" }) },
      ],
    });
  });

  it("renders dashboard data for a Firestore-provisioned user", async () => {
    const { getHub } = await import("./hub");

    const hub = await getHub(user);

    expect(hub.greetingName).toBe("Learner");
    expect(hub.targetScore).toBe(750);
    expect(hub.level).toBe("B1");
    expect(hub.completedTests).toBe(1);
    expect(hub.averageScore).toBe(85);
    expect(hub.masteredWords).toBe(1);
  });
});
