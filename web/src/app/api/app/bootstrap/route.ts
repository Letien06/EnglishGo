import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUserForRead } from "@/lib/auth/session";
import type { AppUser } from "@/types";
import type { StudyStreakSummary } from "@/lib/services/study-activity";

type AppBootstrapPayload = {
  authenticated: boolean;
  user: Pick<AppUser, "uid" | "email" | "displayName" | "role"> | null;
  streak: (StudyStreakSummary & { authenticated: true }) | null;
};

/**
 * Resolve identity immediately. Optional widgets load their own data after
 * mounting; their Firestore reads must not block the learner progress queues.
 */
export const GET = withErrorHandling(async () => {
  const user = await getCurrentUserForRead();
  if (!user) {
    return ok<AppBootstrapPayload>({ authenticated: false, user: null, streak: null });
  }

  return ok<AppBootstrapPayload>({
    authenticated: true,
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
    streak: null,
  });
});
