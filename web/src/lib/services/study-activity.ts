import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";

const ACTIVITY_COLLECTION = "studyActivity";
const STREAK_LOOKBACK_LIMIT = 500;
const STUDY_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type StudyModule = "listening" | "reading" | "practice" | "vocab";

export interface StudyActivityInput {
  module: StudyModule;
  activityType: string;
  sourceId?: string | number | null;
  occurredAtMillis?: number | null;
}

export interface StudyStreakSummary {
  streakDays: number;
  studiedToday: boolean;
  todayActivityCount: number;
  todayModules: StudyModule[];
  todayDateKey: string;
}

export async function recordStudyActivity(
  uid: string,
  input: StudyActivityInput,
): Promise<void> {
  if (!uid?.trim()) return;

  const now = input.occurredAtMillis ?? Date.now();
  const dateKey = dateKeyForMillis(now);
  const ref = activityCollection(uid).doc(dateKey);
  const sourceId = input.sourceId == null ? null : String(input.sourceId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as
      | { firstActivityAtMillis?: number; activityCount?: number }
      | undefined;

    tx.set(
      ref,
      {
        dateKey,
        activityCount: FieldValue.increment(1),
        modules: FieldValue.arrayUnion(input.module),
        activityTypes: FieldValue.arrayUnion(input.activityType),
        ...(sourceId ? { sourceIds: FieldValue.arrayUnion(sourceId) } : {}),
        firstActivityAtMillis: current?.firstActivityAtMillis ?? now,
        lastActivityAtMillis: now,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
  });
}

export async function getStudyStreak(uid: string): Promise<StudyStreakSummary> {
  if (!uid?.trim()) {
    return emptySummary();
  }

  const snap = await activityCollection(uid)
    .orderBy("dateKey", "desc")
    .limit(STREAK_LOOKBACK_LIMIT)
    .get();

  const byDate = new Map<string, { activityCount: number; modules: StudyModule[] }>();
  for (const doc of snap.docs) {
    const data = doc.data();
    const dateKey = typeof data.dateKey === "string" ? data.dateKey : doc.id;
    if (!dateKey) continue;
    byDate.set(dateKey, {
      activityCount: typeof data.activityCount === "number" ? data.activityCount : 0,
      modules: parseModules(data.modules),
    });
  }

  const todayKey = dateKeyForMillis(Date.now());
  const today = byDate.get(todayKey);
  let streakDays = 0;
  let expected = todayKey;

  if (!today) {
    expected = addDaysToDateKey(todayKey, -1);
  }

  while (byDate.has(expected)) {
    streakDays++;
    expected = addDaysToDateKey(expected, -1);
  }

  return {
    streakDays,
    studiedToday: Boolean(today),
    todayActivityCount: today?.activityCount ?? 0,
    todayModules: today?.modules ?? [],
    todayDateKey: todayKey,
  };
}

function activityCollection(uid: string) {
  return adminDb.collection("users").doc(uid).collection(ACTIVITY_COLLECTION);
}

function emptySummary(): StudyStreakSummary {
  return {
    streakDays: 0,
    studiedToday: false,
    todayActivityCount: 0,
    todayModules: [],
    todayDateKey: dateKeyForMillis(Date.now()),
  };
}

function parseModules(value: unknown): StudyModule[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StudyModule =>
    item === "listening" ||
    item === "reading" ||
    item === "practice" ||
    item === "vocab",
  );
}

function dateKeyForMillis(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
