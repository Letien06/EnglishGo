import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUserForRead, requireUser } from "@/lib/auth/session";
import {
  claimStudyStreakMilestone,
  getStoredStudyStreakSummary,
  getStudyStreak,
  type StudyStreakSummary,
} from "@/lib/services/study-activity";

export const GET = withErrorHandling<StudyStreakSummary & { authenticated: boolean }>(async () => {
  const user = await getCurrentUserForRead();
  if (!user) {
    return ok({
      streakDays: 0,
      studiedToday: false,
      todayActivityCount: 0,
      todayModules: [],
      todayDateKey: "",
      authenticated: false,
    });
  }

  const streak =
    await getStoredStudyStreakSummary(user.uid) ??
    await getStudyStreak(user.uid);
  return ok({
    ...streak,
    authenticated: true,
  });
});

/** Reserve a newly reached streak milestone for the one-time client celebration. */
export const POST = withErrorHandling(async () => {
  const user = await requireUser();
  return ok(await claimStudyStreakMilestone(user.uid));
});
