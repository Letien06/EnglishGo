import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUserForRead } from "@/lib/auth/session";
import type { AppUser } from "@/types";

type AppSessionPayload = {
  authenticated: boolean;
  user: Pick<AppUser, "uid" | "email" | "displayName" | "role"> | null;
};

/**
 * Lightweight identity endpoint for client caches. It deliberately excludes
 * streak and other dashboard data so pages can identify the current
 * learner before optional widgets begin loading.
 */
export const GET = withErrorHandling(async () => {
  const user = await getCurrentUserForRead();
  if (!user) {
    return ok<AppSessionPayload>({ authenticated: false, user: null });
  }

  return ok<AppSessionPayload>({
    authenticated: true,
    user: {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  });
});
