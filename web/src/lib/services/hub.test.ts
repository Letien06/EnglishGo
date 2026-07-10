import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/types";

const profileGet = vi.fn();
const practiceAttemptsGet = vi.fn();
const practiceAttemptsCountGet = vi.fn();
const masteredCountGet = vi.fn();
const todaySummaryGet = vi.fn();

function todayDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

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
              return {
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => ({ get: practiceAttemptsGet })),
                })),
                count: vi.fn(() => ({ get: practiceAttemptsCountGet })),
              };
            }
            if (subcollectionName === "dailySummaries") {
              return {
                doc: vi.fn(() => ({ get: todaySummaryGet })),
              };
            }
            if (subcollectionName === "userVocabProgress") {
              return {
                where: vi.fn(() => ({
                  count: vi.fn(() => ({ get: masteredCountGet })),
                })),
              };
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
        studyTodayDateKey: todayDateKey(),
        studyStreakUpdatedAtMillis: Date.now(),
        studyStreakDays: 3,
        studyStudiedToday: true,
        studyTodayActivityCount: 4,
        studyTodayModules: ["practice"],
        studyTodayXp: 35,
        studyTodayModuleCounts: {
          practice: 1,
          reading: 1,
          listening: 1,
          vocab: 1,
        },
        studyModuleTotals: {
          practice: 3,
          reading: 4,
          listening: 5,
          vocab: 6,
        },
        lastStudyActivityAtMillis: 123456,
        practiceCompletedTests: 1,
        practiceAverageScore: 85,
        vocabMasteredWords: 1,
        vocabDueWords: 0,
        vocabNextDueAtMillis: Date.now() + 86_400_000,
      }),
    });
    practiceAttemptsGet.mockResolvedValue({
      docs: [
        {
          get: (field: string) => field === "score" ? 85 : Date.now(),
        },
      ],
    });
    practiceAttemptsCountGet.mockResolvedValue({
      data: () => ({ count: 1 }),
    });
    masteredCountGet.mockResolvedValue({
      data: () => ({ count: 1 }),
    });
    todaySummaryGet.mockResolvedValue({
      exists: true,
      data: () => ({
        totalActivityCount: 4,
        xp: 35,
        moduleCounts: {
          practice: 1,
          reading: 1,
          listening: 1,
          vocab: 1,
        },
      }),
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
    expect(hub.streakDays).toBe(3);
    expect(hub.dailyGoalCompleted).toBe(4);
    expect(hub.todayXp).toBe(35);
    expect(hub.todayPractice).toBe(1);
    expect(hub.todayVocab).toBe(1);
    expect(hub.moduleTotals.practice).toBe(3);
    expect(hub.moduleTotals.vocab).toBe(6);
    expect(hub.lastActivityAtMillis).toBe(123456);
  });
});
