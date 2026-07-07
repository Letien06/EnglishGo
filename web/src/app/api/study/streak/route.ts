import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { getStoredStudyStreakSummary, getStudyStreak } from "@/lib/services/study-activity";

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
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
