import { beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardDateKey, dashboardRange, defaultDashboardPreferences, isDashboardDate } from "@/lib/dashboard-model";
import { aggregateDashboardMetrics, dashboardPreferencesSchema, getDashboardStats, getDashboardView, metricsFromDailySummary, preferencesFromProfile, updateDashboardPreferences } from "./dashboard";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), daily: vi.fn(), range: vi.fn(), where: vi.fn(), set: vi.fn(), invalidateProfile: vi.fn(), invalidateLearner: vi.fn(), collection: vi.fn(), streak: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ invalidateCurrentUserProfileCache: mocks.invalidateProfile }));
vi.mock("./learner-cache", () => ({ dashboardCacheTag: (uid: string) => `dashboard:${uid}`, invalidateLearnerActivityCaches: mocks.invalidateLearner }));
vi.mock("@/lib/server-cache", () => ({ readServerCache: (reader: () => Promise<unknown>) => reader() }));
vi.mock("./study-activity", () => ({ getStudyStreak: mocks.streak }));
vi.mock("@/lib/firestore/db", () => {
  const query = { where: (...args: unknown[]) => { mocks.where(...args); return query; }, orderBy: () => query, get: mocks.range };
  const daily = { ...query, doc: (key: string) => ({ get: () => mocks.daily(key) }) };
  const user = { get: mocks.profile, collection: (name: string) => { mocks.collection(name); return daily; } };
  return { adminDb: { collection: (name: string) => { mocks.collection(name); return { doc: () => user }; }, runTransaction: (reader: (tx: unknown) => Promise<unknown>) => reader({ get: mocks.profile, set: mocks.set }) } };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ exists: true, data: () => ({}) });
  mocks.daily.mockResolvedValue({ exists: false, data: () => undefined });
  mocks.range.mockResolvedValue({ docs: [] });
  mocks.streak.mockResolvedValue({ streakDays: 0, studiedToday: false, todayActivityCount: 0, todayDateKey: dashboardDateKey() });
});

describe("dashboard contract and preferences", () => {
  it("uses timezone calendar boundaries and rejects invalid or future custom dates", () => {
    const now = Date.parse("2026-10-06T18:00:00Z");
    expect(dashboardDateKey(now)).toBe("2026-10-07");
    expect(dashboardRange("week", undefined, undefined, now)).toEqual({ start: "2026-10-05", end: "2026-10-07" });
    expect(dashboardRange("month", undefined, undefined, now).start).toBe("2026-10-01");
    expect(isDashboardDate("2026-02-30")).toBe(false);
    expect(() => dashboardRange("custom", "2026-10-08", "2026-10-08", now)).toThrow();
    expect(() => dashboardRange("custom", "2026-10-07", "2026-10-06", now)).toThrow();
  });
  it("defaults goals and preserves deliberate clearing of current score and exam date", () => {
    expect(preferencesFromProfile({})).toEqual(defaultDashboardPreferences());
    expect(preferencesFromProfile({ currentScore: 650, examDate: "2026-12-01", dashboardPreferences: { currentScore: null, examDate: null } })).toMatchObject({ currentScore: null, examDate: null });
    expect(preferencesFromProfile({ targetScore: 900 })).toMatchObject({ targetScore: 900 });
  });
  it("validates score steps, calendar dates and all five daily-goal bounds", () => {
    for (const input of [{ currentScore: 651 }, { targetScore: 995 }, { examDate: "2026-02-30" }, { uid: "another-user", targetScore: 750 }, {}]) expect(dashboardPreferencesSchema.safeParse(input).success).toBe(false);
    for (const [key, limit] of Object.entries({ reading: 200, listening: 200, vocab: 400, practice: 1000, video: 20 })) {
      const goals = defaultDashboardPreferences().dailyGoals;
      goals[key as keyof typeof goals].target = limit + 1;
      expect(dashboardPreferencesSchema.safeParse({ dailyGoals: goals }).success).toBe(false);
    }
    expect(dashboardPreferencesSchema.safeParse({ currentScore: 0, targetScore: 990, examDate: null }).success).toBe(true);
  });
  it("merges partial preferences and invalidates learner/profile caches", async () => {
    mocks.profile.mockResolvedValue({ data: () => ({ targetScore: 800, unrelated: "retain", dashboardPreferences: { currentScore: 500, examDate: "2026-12-01" } }) });
    const result = await updateDashboardPreferences("learner", { currentScore: null });
    expect(result).toMatchObject({ currentScore: null, targetScore: 800, examDate: "2026-12-01" });
    expect(mocks.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ targetScore: 800, dashboardPreferences: result }), { merge: true });
    expect(mocks.invalidateProfile).toHaveBeenCalledOnce();
    expect(mocks.invalidateLearner).toHaveBeenCalledWith("learner");
  });
});

describe("dashboard measured metrics", () => {
  it("never turns legacy activity counts into question or word counts", () => {
    const legacy = metricsFromDailySummary({ totalActivityCount: 5, moduleCounts: { reading: 3, vocab: 2 }, xp: 30 });
    expect(legacy).toMatchObject({ reading: null, vocab: null, practice: null, writing: null, activities: 5, xp: 30, studySeconds: null, speaking: null });
  });
  it("sums measured portions of mixed legacy days and identifies partial coverage", () => {
    const measured = { metricsVersion: 1, totalActivityCount: 1, xp: 10, metrics: { reading: 7, listening: 0, practice: 0, vocab: 0, writing: 0, video: 0, studySeconds: 120 } };
    expect(metricsFromDailySummary(measured)).toMatchObject({ reading: 7, listening: 0, studySeconds: 120 });
    expect(aggregateDashboardMetrics([measured, { ...measured, metricsIncomplete: true }])).toMatchObject({ reading: 14, activities: 2, xp: 20, studySeconds: 240, hasLegacyData: true });
    expect(aggregateDashboardMetrics([{ totalActivityCount: 5 }, { ...measured, dateKey: "2026-10-07", metricsSinceMillis: Date.parse("2026-10-07T03:00:00Z") }])).toMatchObject({ reading: 7, activities: 6, hasLegacyData: true, measurementSince: "2026-10-07" });
    expect(aggregateDashboardMetrics([{ totalActivityCount: 5 }])).toMatchObject({ reading: null, vocab: null, hasLegacyData: true, measurementSince: null });
    expect(aggregateDashboardMetrics([])).toMatchObject({ reading: 0, vocab: 0, studySeconds: null, speaking: null });
  });
  it("loads the initial view with two document reads and leaves unavailable longest streak null", async () => {
    mocks.profile.mockResolvedValue({ data: () => ({ studyTodayDateKey: dashboardDateKey(), studyStreakDays: 3, studyStudiedToday: true, studyTodayActivityCount: 2, studyStreakUpdatedAtMillis: Date.now(), lastStudyActivityAtMillis: Date.now(), totalStudyXp: 100, vocabDueWords: 8 }) });
    const result = await getDashboardView("learner", "Lan");
    expect(result).toMatchObject({ greetingName: "Lan", streakDays: 3, longestStreakDays: null, totalXp: 100, dueVocabWords: 8 });
    expect(result.stats).toEqual(result.today);
    expect(mocks.profile).toHaveBeenCalledOnce();
    expect(mocks.daily).toHaveBeenCalledOnce();
    expect(mocks.range).not.toHaveBeenCalled();
    expect(mocks.streak).not.toHaveBeenCalled();
  });
  it("replaces an incoherent stored streak with the actual history while preserving the longest run", async () => {
    mocks.profile.mockResolvedValue({ data: () => ({ studyTodayDateKey: dashboardDateKey(), studyStreakDays: 9, studyStudiedToday: false, studyStreakUpdatedAtMillis: Date.now(), lastStudyActivityAtMillis: Date.now(), studyLongestStreakDays: 12 }) });
    mocks.streak.mockResolvedValue({ streakDays: 1, studiedToday: true, todayActivityCount: 2, todayDateKey: dashboardDateKey() });
    const result = await getDashboardView("learner");
    expect(result).toMatchObject({ streakDays: 1, longestStreakDays: 12 });
    expect(mocks.streak).toHaveBeenCalledWith("learner");
  });
  it("queries only daily aggregates in the requested range and propagates read failures", async () => {
    await getDashboardStats("learner", "custom", "2026-01-01", "2026-01-05");
    expect(mocks.where).toHaveBeenNthCalledWith(1, "dateKey", ">=", "2026-01-01");
    expect(mocks.where).toHaveBeenNthCalledWith(2, "dateKey", "<=", "2026-01-05");
    expect(mocks.collection.mock.calls.map(([name]) => name)).toEqual(["users", "dailySummaries"]);
    mocks.range.mockRejectedValue(new Error("quota exceeded"));
    await expect(getDashboardStats("learner", "all")).rejects.toThrow("quota exceeded");
    await expect(getDashboardView("")).rejects.toThrow("Authentication required");
  });
});
