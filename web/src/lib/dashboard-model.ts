export const GOAL_KEYS = ["reading", "listening", "vocab", "practice", "video"] as const;
export type GoalKey = typeof GOAL_KEYS[number];
export type DashboardPeriod = "today" | "week" | "month" | "all" | "custom";
export interface DashboardMetrics {
  reading: number | null;
  listening: number | null;
  practice: number | null;
  vocab: number | null;
  writing: number | null;
  video: number | null;
  studySeconds: number | null;
  speaking: number | null;
  activities: number;
  xp: number;
  measurementSince?: string | null;
  hasLegacyData?: boolean;
}
export interface DashboardPreferences {
  currentScore: number | null;
  targetScore: number;
  examDate: string | null;
  dailyGoals: Record<GoalKey, { enabled: boolean; target: number }>;
}
export interface DashboardView {
  greetingName: string;
  todayDateKey: string;
  preferences: DashboardPreferences;
  today: DashboardMetrics;
  stats: DashboardMetrics;
  streakDays: number;
  longestStreakDays: number | null;
  totalXp: number;
  dueVocabWords?: number;
}
export interface DashboardStats { metrics: DashboardMetrics; start: string; end: string; coverageFrom?: string | null; partialHistory?: boolean }

export function defaultDashboardPreferences(): DashboardPreferences {
  return { currentScore: null, targetScore: 750, examDate: null, dailyGoals: { reading: { enabled: true, target: 30 }, listening: { enabled: true, target: 30 }, vocab: { enabled: true, target: 20 }, practice: { enabled: true, target: 40 }, video: { enabled: true, target: 2 } } };
}
export function dashboardDateKey(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function isDashboardDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function dashboardRange(period: DashboardPeriod, start?: string, end?: string, now = Date.now()): { start: string; end: string } {
  const today = dashboardDateKey(now);
  if (period === "custom") {
    if (!start || !end || !isDashboardDate(start) || !isDashboardDate(end) || start > end || end > today) throw new Error("Invalid date range");
    return { start, end };
  }
  if (period === "all") return { start: "1970-01-01", end: today };
  const date = new Date(`${today}T00:00:00Z`);
  if (period === "week") date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  if (period === "month") date.setUTCDate(1);
  return { start: date.toISOString().slice(0, 10), end: today };
}
