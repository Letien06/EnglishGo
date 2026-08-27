import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import { getPetWidgetSummary } from "@/lib/services/pet";
import { getStoredStudyStreakSummary, getStudyStreak } from "@/lib/services/study-activity";
import type { AppUser } from "@/types";
import type { PetWidgetSummary } from "@/types/pet";
import type { StudyStreakSummary } from "@/lib/services/study-activity";

type AppBootstrapPayload = {
  authenticated: boolean;
  user: Pick<AppUser, "uid" | "email" | "displayName" | "role"> | null;
  streak: (StudyStreakSummary & { authenticated: true }) | null;
  pet: PetWidgetSummary | null;
};

/**
 * One small request after the first paint replaces separate session, streak,
 * and floating-pet requests. It intentionally excludes inventories, history,
 * and any learning content.
 */
export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return ok<AppBootstrapPayload>({ authenticated: false, user: null, streak: null, pet: null });
  }

  const [storedStreak, pet] = await Promise.all([
    getStoredStudyStreakSummary(user.uid),
    getPetWidgetSummary(user.uid),
  ]);
  const streak = storedStreak ?? await getStudyStreak(user.uid);

  return ok<AppBootstrapPayload>({
    authenticated: true,
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
    streak: { ...streak, authenticated: true },
    pet,
  });
});
