import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firestore/db";
import { normalizeStudyStreak, studyDateKey } from "@/lib/study-streak";
import { invalidateLearnerActivityCaches } from "./learner-cache";

export type PresenceInput = { sessionId: string; sequence: number; elapsedSeconds: number; active: boolean; dateKey: string };
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

function snapshot(profile: Record<string, unknown>, day: string, ownsSession: boolean) {
  return {
    ...normalizeStudyStreak(profile, day),
    authenticated: true,
    onlineSecondsToday: profile.studyTodayOnlineDateKey === day ? count(profile.studyTodayOnlineSeconds) : 0,
    totalOnlineSeconds: count(profile.totalOnlineSeconds),
    onlineQualifiedToday: profile.studyOnlineQualifiedDateKey === day,
    ownsSession,
  };
}

export async function getOnlinePresence(uid: string) {
  const profile = await adminDb.collection("users").doc(uid).get();
  return snapshot(profile.data() ?? {}, studyDateKey(), false);
}

/** One server lease per account bounds credit by real elapsed time across tabs/devices. */
export async function recordOnlinePresence(uid: string, input: PresenceInput) {
  const userRef = adminDb.collection("users").doc(uid);
  const leaseRef = userRef.collection("onlinePresence").doc("current");
  const result = await adminDb.runTransaction(async (tx) => {
    const [userSnap, leaseSnap] = await Promise.all([tx.get(userRef), tx.get(leaseRef)]);
    const now = Date.now();
    const day = studyDateKey(now);
    const profile = userSnap.data() ?? {};
    const lease = leaseSnap.data() ?? {};
    const sameSession = lease.sessionId === input.sessionId;
    const gap = Math.max(0, now - count(lease.lastAtMillis)) / 1000;
    const locked = !sameSession && lease.active === true && gap < 35;
    const duplicate = sameSession && input.sequence <= count(lease.sequence);
    if (locked || duplicate || input.dateKey !== day || (!sameSession && !input.active)) {
      return { data: snapshot(profile, day, sameSession && lease.active === true), crossed: false };
    }

    // A new/resumed/suspended session starts with no credit. Midnight never carries yesterday's seconds into today.
    const secondsSinceMidnight = (now - Date.parse(`${day}T00:00:00+07:00`)) / 1000;
    const credit = sameSession && lease.active === true && gap <= 75
      ? Math.max(0, Math.min(60, input.elapsedSeconds, gap, secondsSinceMidnight)) : 0;
    tx.set(leaseRef, { sessionId: input.sessionId, sequence: input.sequence, active: input.active, lastAtMillis: now });
    const previousSeconds = profile.studyTodayOnlineDateKey === day ? count(profile.studyTodayOnlineSeconds) : 0;
    const seconds = Math.min(86400, previousSeconds + credit);
    const crossed = previousSeconds < 600 && seconds >= 600;
    const current = normalizeStudyStreak(profile, day);
    const next: Record<string, unknown> = {
      studyTodayOnlineDateKey: day,
      studyTodayOnlineSeconds: seconds,
      totalOnlineSeconds: count(profile.totalOnlineSeconds) + credit,
    };
    if (crossed) {
      const streakDays = current.studiedToday ? current.streakDays : current.streakDays + 1;
      Object.assign(next, {
        studyOnlineQualifiedDateKey: day,
        studyStreakDays: streakDays,
        studyLongestStreakDays: Math.max(count(profile.studyLongestStreakDays), current.streakDays, streakDays),
        studyStudiedToday: true,
        studyTodayDateKey: day,
        studyStreakUpdatedAtMillis: now,
        lastStudyActivityAtMillis: now,
        ...(!current.studiedToday && current.streakDays === 0 ? { studyStreakMilestonesSeen: [] } : {}),
        ...(profile.studyTodayDateKey !== day ? {
          studyTodayActivityCount: 0, studyTodayModules: [], studyTodayXp: 0,
          studyTodayModuleCounts: { reading: 0, listening: 0, practice: 0, vocab: 0, writing: 0, video: 0 },
          studyTodayMetrics: { reading: 0, listening: 0, practice: 0, vocab: 0, writing: 0, video: 0, studySeconds: FieldValue.delete() },
          studyTodayMetricsSinceMillis: now, studyTodayMetricsIncomplete: false,
        } : {}),
      });
    }
    if (credit > 0) {
      tx.set(userRef, next, { merge: true });
      tx.set(userRef.collection("studyActivity").doc(day), {
        dateKey: day, onlineSeconds: seconds,
        ...(crossed ? { streakEligible: true, lastActivityAtMillis: now } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { data: snapshot({ ...profile, ...next }, day, input.active), crossed };
  });
  if (result.crossed) invalidateLearnerActivityCaches(uid);
  return result.data;
}
