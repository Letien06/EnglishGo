/**
 * GET /api/reading/levels?part=<num> — enriched difficulty levels for a
 * reading part (content + this user's progress).
 *
 * Used by the client-side dashboard (LevelDashboardClient) so navigating back
 * to /read reuses a session cache instead of re-rendering the whole Server
 * Component and re-querying on every visit.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, ApiError } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import * as reading from "@/lib/services/reading";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const partParam = new URL(req.url).searchParams.get("part");
  const part = Number.parseInt(partParam ?? "", 10);
  if (Number.isNaN(part) || part < 5 || part > 7) {
    throw new ApiError("Reading part must be between 5 and 7", 400);
  }
  const [user, base] = await Promise.all([
    getCurrentUser(),
    dautoeic.listReadingDifficultyLevels(part),
  ]);
  const levels = await reading.applyProgress(user?.uid ?? null, base);
  return ok({ levels });
});
