/**
 * GET /api/listening/levels?part=<num> — enriched difficulty levels for a
 * listening part (content + this user's progress).
 *
 * Used by the client-side dashboard (LevelDashboardClient) so navigating back
 * to /listen reuses a session cache instead of re-rendering the whole Server
 * Component and re-querying on every visit.
 */
import { NextRequest } from "next/server";
import { withErrorHandling } from "@/lib/api/handler";
import { ok, ApiError } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeic from "@/lib/services/dautoeic";
import * as listening from "@/lib/services/listening";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const partParam = new URL(req.url).searchParams.get("part");
  const part = Number.parseInt(partParam ?? "", 10);
  if (Number.isNaN(part) || part < 1 || part > 4) {
    throw new ApiError("Listening part must be between 1 and 4", 400);
  }
  const user = await getCurrentUser();
  const base = await dautoeic.listDifficultyLevels(part);
  const levels = await listening.applyProgress(user?.uid ?? null, base);
  return ok({ levels });
});
